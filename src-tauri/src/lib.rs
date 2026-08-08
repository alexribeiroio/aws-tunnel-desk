use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    net::{Ipv4Addr, SocketAddrV4, TcpListener},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const PORT_START: u16 = 15432;
const PORT_END: u16 = 15531;

#[derive(Default)]
struct TunnelState {
    children: Mutex<HashMap<String, ManagedTunnel>>,
}

struct ManagedTunnel {
    child: Child,
    local_port: u16,
}

impl Drop for ManagedTunnel {
    fn drop(&mut self) {
        let _ = terminate_process_tree(&mut self.child);
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemStatus {
    aws_cli: bool,
    session_manager_plugin: bool,
    platform: String,
    environment: String,
    architecture: String,
    wsl: Vec<WslDistribution>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerStatus {
    aws_cli: bool,
    session_manager_plugin: bool,
}

#[derive(Debug, Serialize)]
struct WslDistribution {
    name: String,
    version: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AwsProfile {
    name: String,
    region: String,
    auth: String,
    status: String,
    account_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveredRdsEndpoint {
    id: String,
    label: String,
    endpoint: String,
    db_port: u16,
    endpoint_role: String,
    engine: String,
    vpc_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveredSsmTarget {
    id: String,
    label: String,
    vpc_id: Option<String>,
    resource_type: String,
    platform_name: String,
    default_port: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TunnelDiscovery {
    rds_endpoints: Vec<DiscoveredRdsEndpoint>,
    ssm_targets: Vec<DiscoveredSsmTarget>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum Runner {
    Native,
    Wsl { distribution: String },
}

#[derive(Debug, Serialize)]
struct PortSuggestion {
    port: u16,
    message: String,
}

#[derive(Debug, Serialize)]
struct PluginInstallResult {
    installed: bool,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TunnelRequest {
    profile: String,
    region: String,
    target: String,
    host: String,
    remote_port: u16,
    connection_mode: String,
    runner: Runner,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveTunnel {
    id: String,
    local_port: u16,
    local_host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApprovedDestination {
    id: String,
    label: String,
    profile: String,
    region: String,
    endpoint: String,
    db_port: u16,
    endpoint_role: String,
    ssm_target: String,
    #[serde(default = "default_resource_type")]
    resource_type: String,
    #[serde(default = "default_connection_mode")]
    connection_mode: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalInput {
    label: String,
    profile: String,
    region: String,
    endpoint: String,
    db_port: u16,
    endpoint_role: String,
    ssm_target: String,
    resource_type: String,
    connection_mode: String,
}

fn default_resource_type() -> String {
    "rds".into()
}

fn default_connection_mode() -> String {
    "remote_host".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ActivityEvent {
    id: String,
    time: String,
    action: String,
    detail: String,
    status: String,
}

#[derive(Default, Serialize, Deserialize)]
struct LocalConfig {
    #[serde(default)]
    approved_destinations: Vec<ApprovedDestination>,
    #[serde(default)]
    activity_events: Vec<ActivityEvent>,
}

fn output_with_timeout(
    command: &mut Command,
    timeout: Duration,
) -> Result<std::process::Output, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("Unable to run the command: {error}"))?;
    let started_at = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child
                    .wait_with_output()
                    .map_err(|error| format!("Unable to read command output: {error}"));
            }
            Ok(None) if started_at.elapsed() < timeout => thread::sleep(Duration::from_millis(40)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Timed out while running AWS CLI.".into());
            }
            Err(error) => return Err(format!("Unable to monitor the command: {error}")),
        }
    }
}

fn executable_available(program: &str) -> bool {
    let mut command = Command::new(program);
    command.arg("--version");
    output_with_timeout(&mut command, Duration::from_secs(2))
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn session_manager_available(runner: &Runner) -> bool {
    match runner {
        Runner::Native => executable_available("session-manager-plugin"),
        Runner::Wsl { distribution } if is_safe_identifier(distribution) => Command::new("wsl.exe")
            .args([
                "-d",
                distribution,
                "--",
                "session-manager-plugin",
                "--version",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false),
        Runner::Wsl { .. } => false,
    }
}

fn aws_available(runner: &Runner) -> bool {
    let Ok(mut command) = command_for_runner(runner) else {
        return false;
    };
    command.arg("--version");
    output_with_timeout(&mut command, Duration::from_secs(3))
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn checked_command_output(
    command: &mut Command,
    timeout: Duration,
    failure_message: &str,
) -> Result<std::process::Output, String> {
    let output = output_with_timeout(command, timeout)?;
    if output.status.success() {
        return Ok(output);
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail = stderr.lines().next().unwrap_or(failure_message).trim();
    Err(format!("{failure_message}: {detail}"))
}

#[cfg(target_os = "linux")]
fn install_native_session_manager_plugin() -> Result<PluginInstallResult, String> {
    const SIGNING_KEY: &str = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\
mFIEZ5ERQxMIKoZIzj0DAQcCAwQjuZy+IjFoYg57sLTGhF3aZLBaGpzB+gY6j7Ix\n\
P7NqbpXyjVj8a+dy79gSd64OEaMxUb7vw/jug+CfRXwVGRMNtIBBV1MgU1NNIFNl\n\
c3Npb24gTWFuYWdlciA8c2Vzc2lvbi1tYW5hZ2VyLXBsdWdpbi1zaWduZXJAYW1h\n\
em9uLmNvbT4gKEFXUyBTeXN0ZW1zIE1hbmFnZXIgU2Vzc2lvbiBNYW5hZ2VyIFBs\n\
dWdpbiBMaW51eCBTaWduZXIgS2V5KYkBAAQQEwgAqAUCZ5ERQ4EcQVdTIFNTTSBT\n\
ZXNzaW9uIE1hbmFnZXIgPHNlc3Npb24tbWFuYWdlci1wbHVnaW4tc2lnbmVyQGFt\n\
YXpvbi5jb20+IChBV1MgU3lzdGVtcyBNYW5hZ2VyIFNlc3Npb24gTWFuYWdlciBQ\n\
bHVnaW4gTGludXggU2lnbmVyIEtleSkWIQR5WWNxJM4JOtUB1HosTUr/b2dX7gIe\n\
AwIbAwIVCAAKCRAsTUr/b2dX7rO1AQCa1kig3lQ78W/QHGU76uHx3XAyv0tfpE9U\n\
oQBCIwFLSgEA3PDHt3lZ+s6m9JLGJsy+Cp5ZFzpiF6RgluR/2gA861M=\n\
=2DQm\n\
-----END PGP PUBLIC KEY BLOCK-----\n";
    const EXPECTED_FINGERPRINT: &str = "7959637124CE093AD501D47A2C4D4AFF6F6757EE";

    if executable_available("session-manager-plugin") {
        return Ok(PluginInstallResult {
            installed: true,
            message: "Session Manager Plugin is already available.".into(),
        });
    }
    for dependency in ["curl", "gpg", "pkexec", "dpkg"] {
        if !Command::new("sh")
            .args(["-c", &format!("command -v {dependency}")])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
        {
            return Err(format!(
                "Assisted installation requires the local command '{dependency}'."
            ));
        }
    }

    let architecture = match std::env::consts::ARCH {
        "x86_64" => "ubuntu_64bit",
        "aarch64" => "ubuntu_arm64",
        other => return Err(format!("Unsupported Linux architecture: {other}.")),
    };
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let directory = std::env::temp_dir().join(format!("aws-tunnel-desk-plugin-{nonce}"));
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Unable to prepare the installation: {error}"))?;
    let package = directory.join("session-manager-plugin.deb");
    let signature = directory.join("session-manager-plugin.deb.sig");
    let key_file = directory.join("session-manager-plugin.gpg");
    let keyring = directory.join("gnupg");
    fs::create_dir(&keyring).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&keyring, fs::Permissions::from_mode(0o700))
            .map_err(|error| error.to_string())?;
    }
    fs::write(&key_file, SIGNING_KEY)
        .map_err(|error| format!("Unable to prepare the verification key: {error}"))?;

    let package_url = format!(
        "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/{architecture}/session-manager-plugin.deb"
    );
    let signature_url = format!("{package_url}.sig");
    let package_path = package.to_string_lossy().into_owned();
    let signature_path = signature.to_string_lossy().into_owned();
    for (url, output) in [
        (package_url.as_str(), package_path.as_str()),
        (signature_url.as_str(), signature_path.as_str()),
    ] {
        let mut command = Command::new("curl");
        command.args([
            "--fail",
            "--location",
            "--proto",
            "=https",
            "--tlsv1.2",
            "--output",
            output,
            url,
        ]);
        checked_command_output(
            &mut command,
            Duration::from_secs(180),
            "Failed to download the official AWS package",
        )?;
    }

    let keyring_path = keyring.to_string_lossy().into_owned();
    let key_path = key_file.to_string_lossy().into_owned();
    let mut import = Command::new("gpg");
    import.args(["--batch", "--homedir", &keyring_path, "--import", &key_path]);
    checked_command_output(
        &mut import,
        Duration::from_secs(30),
        "Failed to import the AWS public key",
    )?;
    let mut fingerprint = Command::new("gpg");
    fingerprint.args([
        "--batch",
        "--homedir",
        &keyring_path,
        "--with-colons",
        "--fingerprint",
        "2C4D4AFF6F6757EE",
    ]);
    let fingerprint_output = checked_command_output(
        &mut fingerprint,
        Duration::from_secs(30),
        "Failed to validate the AWS public key",
    )?;
    if !String::from_utf8_lossy(&fingerprint_output.stdout).contains(EXPECTED_FINGERPRINT) {
        return Err(
            "The signing-key fingerprint does not match the value published by AWS.".into(),
        );
    }
    let mut verify = Command::new("gpg");
    verify.args([
        "--batch",
        "--homedir",
        &keyring_path,
        "--verify",
        &signature_path,
        &package_path,
    ]);
    checked_command_output(
        &mut verify,
        Duration::from_secs(30),
        "The package signature could not be validated",
    )?;

    let mut install = Command::new("pkexec");
    install.args(["dpkg", "-i", &package_path]);
    checked_command_output(
        &mut install,
        Duration::from_secs(600),
        "The installation was canceled or failed",
    )?;
    let installed = executable_available("session-manager-plugin");
    let _ = fs::remove_dir_all(&directory);
    if !installed {
        return Err("The installer finished, but the component was not found in PATH.".into());
    }
    Ok(PluginInstallResult {
        installed: true,
        message: "Session Manager Plugin installed and validated on this computer.".into(),
    })
}

#[cfg(target_os = "windows")]
fn install_native_session_manager_plugin() -> Result<PluginInstallResult, String> {
    if session_manager_available(&Runner::Native) {
        return Ok(PluginInstallResult {
            installed: true,
            message: "Session Manager Plugin is already available.".into(),
        });
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let directory = std::env::temp_dir().join(format!("aws-tunnel-desk-plugin-{nonce}"));
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let installer = directory.join("SessionManagerPluginSetup.exe");
    let installer_path = installer.to_string_lossy().into_owned();
    let mut download = Command::new("curl.exe");
    download.args([
        "--fail",
        "--location",
        "--proto",
        "=https",
        "--tlsv1.2",
        "--output",
        &installer_path,
        "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe",
    ]);
    checked_command_output(
        &mut download,
        Duration::from_secs(180),
        "Failed to download the official AWS installer",
    )?;
    let signature_check = "$signature = Get-AuthenticodeSignature -LiteralPath $args[0]; if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Amazon') { exit 1 }";
    let mut verify = Command::new("powershell.exe");
    verify.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        signature_check,
        &installer_path,
    ]);
    checked_command_output(
        &mut verify,
        Duration::from_secs(60),
        "The installer's Authenticode signature is invalid",
    )?;
    let mut install = Command::new("powershell.exe");
    install.args([
        "-NoProfile",
        "-Command",
        "Start-Process -FilePath $args[0] -Verb RunAs -Wait",
        &installer_path,
    ]);
    checked_command_output(
        &mut install,
        Duration::from_secs(600),
        "The installation was canceled or failed",
    )?;
    let _ = fs::remove_dir_all(directory);
    Ok(PluginInstallResult {
        installed: true,
        message: "Official installer completed. Restart the application if the component is still missing from PATH.".into(),
    })
}

#[cfg(target_os = "macos")]
fn install_native_session_manager_plugin() -> Result<PluginInstallResult, String> {
    if executable_available("session-manager-plugin") {
        return Ok(PluginInstallResult {
            installed: true,
            message: "Session Manager Plugin is already available.".into(),
        });
    }
    let architecture = match std::env::consts::ARCH {
        "x86_64" => "mac",
        "aarch64" => "mac_arm64",
        other => return Err(format!("Unsupported macOS architecture: {other}.")),
    };
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let directory = std::env::temp_dir().join(format!("aws-tunnel-desk-plugin-{nonce}"));
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let package = directory.join("session-manager-plugin.pkg");
    let package_path = package.to_string_lossy().into_owned();
    let url = format!(
        "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/{architecture}/session-manager-plugin.pkg"
    );
    let mut download = Command::new("curl");
    download.args([
        "--fail",
        "--location",
        "--proto",
        "=https",
        "--tlsv1.2",
        "--output",
        &package_path,
        &url,
    ]);
    checked_command_output(
        &mut download,
        Duration::from_secs(180),
        "Failed to download the signed AWS installer",
    )?;
    let mut verify = Command::new("pkgutil");
    verify.args(["--check-signature", &package_path]);
    checked_command_output(
        &mut verify,
        Duration::from_secs(60),
        "The macOS package signature is invalid",
    )?;
    let privileged_command = format!(
        "installer -pkg {} -target / && mkdir -p /usr/local/bin && ln -sf /usr/local/sessionmanagerplugin/bin/session-manager-plugin /usr/local/bin/session-manager-plugin",
        package_path
    );
    let apple_script = format!(
        "do shell script \"{}\" with administrator privileges",
        privileged_command
    );
    let mut install = Command::new("osascript");
    install.args(["-e", &apple_script]);
    checked_command_output(
        &mut install,
        Duration::from_secs(600),
        "The installation was canceled or failed",
    )?;
    let _ = fs::remove_dir_all(directory);
    if !executable_available("session-manager-plugin") {
        return Err("Installation finished, but the component was not found.".into());
    }
    Ok(PluginInstallResult {
        installed: true,
        message: "Session Manager Plugin instalado e validado neste Mac.".into(),
    })
}

#[cfg(target_os = "windows")]
fn start_wsl_session_manager_install(distribution: &str) -> Result<PluginInstallResult, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
    let script = r#"set -e
if ! command -v dpkg >/dev/null || ! command -v curl >/dev/null || ! command -v gpg >/dev/null || ! command -v base64 >/dev/null; then
  echo 'Assisted installation requires a Debian or Ubuntu distribution with curl, dpkg, gpg, and base64.'
  read -r -p 'Press Enter to close...'
  exit 1
fi
case "$(uname -m)" in
  x86_64) package_arch='ubuntu_64bit' ;;
  aarch64|arm64) package_arch='ubuntu_arm64' ;;
  *) echo 'Unsupported WSL architecture.'; read -r -p 'Press Enter to close...'; exit 1 ;;
esac
workdir="$(mktemp -d /tmp/aws-tunnel-desk-plugin.XXXXXX)"
trap 'rm -rf "$workdir"' EXIT
package="$workdir/session-manager-plugin.deb"
signature="$workdir/session-manager-plugin.deb.sig"
key="$workdir/session-manager-plugin.gpg"
keyring="$workdir/gnupg"
printf '%s' 'LS0tLS1CRUdJTiBQR1AgUFVCTElDIEtFWSBCTE9DSy0tLS0tCm1GSUVaNUVSUXhNSUtvWkl6ajBEQVFjQ0F3UWp1WnkrSWpGb1lnNTdzTFRHaEYzYVpMQmFHcHpCK2dZNmo3SXgKUDdOcWJwWHlqVmo4YStkeTc5Z1NkNjRPRWFNeFViN3Z3L2p1ZytDZlJYd1ZHUk1OdElCQlYxTWdVMU5OSUZObApjM05wYjI0Z1RXRnVZV2RsY2lBOGMyVnpjMmx2YmkxdFlXNWhaMlZ5TFhCc2RXZHBiaTF6YVdkdVpYSkFZVzFoCmVtOXVMbU52YlQ0Z0tFRlhVeUJUZVhOMFpXMXpJRTFoYm1GblpYSWdVMlZ6YzJsdmJpQk5ZVzVoWjJWeUlGQnMKZFdkcGJpQk1hVzUxZENCVGFXZHVaWElnUzJWNUtZa0JBQVFRRXdnQXFBVUNaNUVSUTRFY1FWZFRJRk5UVFNCVApaWE56YVc5dUlFMWhibUZuWlhJZ1BITmxjM05wYjI0dGJXRnVZV2RsY2kxd2JIVm5hVzR0YzJsbmJtVnlRR0Z0CllYcHZiaTVqYjIwK0lDaEJWMU1nVTNsemRHVnRjeUJOWVc1aFoyVnlJRk5sYzNOcGIyNGdUV0Z1WVdkbGNpQlEKYkhWbmFXNGdUR2x1ZFhnZ1UybG5ibVZ5SUV0bGVTa1dJUVI1V1dOeEpNNEpPdFVCMUhvc1RVci9iMmRYN2dJZQpBd0liQXdJVkNBQUtDUkFzVFVyL2IyZFg3ck8xQVFDYTFraWczbFE3OFcvUUhHVTc2dUh4M1hBeXYwdGZwRTlVCm9RQkNJd0ZMU2dFQTNQREh0M2xaK3M2bTlKTEdKc3krQ3A1WkZ6cGlGNlJnbHVSLzJnQTg2MU09Cj0yRFFtCi0tLS0tRU5EIFBHUCBQVUJMSUMgS0VZIEJMT0NLLS0tLS0K' | base64 -d > "$key"
curl --fail --location --proto '=https' --tlsv1.2 "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/${package_arch}/session-manager-plugin.deb" -o "$package"
curl --fail --location --proto '=https' --tlsv1.2 "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/${package_arch}/session-manager-plugin.deb.sig" -o "$signature"
mkdir -m 700 "$keyring"
gpg --batch --homedir "$keyring" --import "$key"
fingerprint="$(gpg --batch --homedir "$keyring" --with-colons --fingerprint 2C4D4AFF6F6757EE | awk -F: '$1 == "fpr" { print $10; exit }')"
test "$fingerprint" = '7959637124CE093AD501D47A2C4D4AFF6F6757EE'
gpg --batch --homedir "$keyring" --verify "$signature" "$package"
sudo dpkg -i "$package"
session-manager-plugin --version
echo 'Installation complete. Return to AWS Tunnel Desk and refresh diagnostics.'
read -r -p 'Press Enter to close...'"#;
    Command::new("wsl.exe")
        .args(["-d", distribution, "--", "bash", "-lc", script])
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map_err(|error| format!("Unable to open the installer in WSL: {error}"))?;
    Ok(PluginInstallResult {
        installed: false,
        message: format!(
            "A WSL window was opened to install the component in {distribution}. Complete authentication and refresh diagnostics."
        ),
    })
}

#[cfg(not(target_os = "windows"))]
fn start_wsl_session_manager_install(_distribution: &str) -> Result<PluginInstallResult, String> {
    Err("The WSL runner is available only when the application runs on Windows.".into())
}

fn is_safe_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b".-_:/".contains(&byte))
}

fn approval_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Unable to locate local configuration: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Unable to create local configuration: {error}"))?;
    Ok(directory.join("approved-destinations.json"))
}

fn load_local_config(app: &AppHandle) -> Result<LocalConfig, String> {
    let path = approval_config_path(app)?;
    if !path.exists() {
        return Ok(LocalConfig::default());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Unable to read approved destinations: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|_| "The local approved-destination configuration is invalid.".to_string())
}

fn save_local_config(app: &AppHandle, config: &LocalConfig) -> Result<(), String> {
    let path = approval_config_path(app)?;
    let encoded = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("Unable to serialize local configuration: {error}"))?;
    fs::write(path, encoded)
        .map_err(|error| format!("Unable to save approved destinations: {error}"))
}

fn valid_approval(input: &ApprovalInput) -> bool {
    input.label.trim().len() >= 3
        && input.label.len() <= 80
        && input.db_port > 0
        && [
            &input.profile,
            &input.region,
            &input.endpoint,
            &input.ssm_target,
        ]
        .iter()
        .all(|value| is_safe_identifier(value))
        && matches!(
            input.connection_mode.as_str(),
            "remote_host" | "managed_node"
        )
        && matches!(input.resource_type.as_str(), "rds" | "ec2" | "managed_node")
        && (input.resource_type != "rds"
            || matches!(input.endpoint_role.as_str(), "reader" | "writer"))
}

fn port_is_available(port: u16) -> bool {
    TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)).is_ok()
}

#[cfg(unix)]
fn isolate_tunnel_process(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(windows)]
fn isolate_tunnel_process(_command: &mut Command) {}

fn wait_for_process_exit(child: &mut Child, timeout: Duration) -> Result<bool, String> {
    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return Ok(true),
            Ok(None) if started_at.elapsed() < timeout => {
                thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => return Ok(false),
            Err(error) => return Err(format!("Unable to monitor the tunnel process: {error}")),
        }
    }
}

#[cfg(unix)]
fn terminate_process_tree(child: &mut Child) -> Result<(), String> {
    if child
        .try_wait()
        .map_err(|error| format!("Unable to check the tunnel: {error}"))?
        .is_some()
    {
        return Ok(());
    }

    let process_group = -(child.id() as i32);
    // The AWS CLI and session-manager-plugin are started in this dedicated process group.
    let term_result = unsafe { libc::kill(process_group, libc::SIGTERM) };
    if term_result != 0 {
        child
            .kill()
            .map_err(|error| format!("Unable to close the tunnel: {error}"))?;
    }
    if !wait_for_process_exit(child, Duration::from_secs(2))? {
        let kill_result = unsafe { libc::kill(process_group, libc::SIGKILL) };
        if kill_result != 0 {
            child
                .kill()
                .map_err(|error| format!("Unable to force the tunnel to close: {error}"))?;
        }
        child
            .wait()
            .map_err(|error| format!("Unable to wait for the tunnel to close: {error}"))?;
    }
    Ok(())
}

#[cfg(windows)]
fn terminate_process_tree(child: &mut Child) -> Result<(), String> {
    if child
        .try_wait()
        .map_err(|error| format!("Unable to check the tunnel: {error}"))?
        .is_some()
    {
        return Ok(());
    }

    let pid = child.id().to_string();
    let result = Command::new("taskkill")
        .args(["/PID", &pid, "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if !matches!(result, Ok(status) if status.success()) {
        child
            .kill()
            .map_err(|error| format!("Unable to terminate the tunnel process tree: {error}"))?;
    }
    child
        .wait()
        .map_err(|error| format!("Unable to wait for the tunnel to close: {error}"))?;
    Ok(())
}

fn wait_for_port_release(port: u16) -> bool {
    for _ in 0..20 {
        if port_is_available(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(50));
    }
    false
}

fn next_native_port() -> Option<u16> {
    (PORT_START..=PORT_END).find(|port| port_is_available(*port))
}

#[cfg(target_os = "windows")]
fn wsl_distributions() -> Vec<WslDistribution> {
    let output = Command::new("wsl.exe")
        .args(["--list", "--verbose"])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .skip(1)
        .filter_map(|line| {
            let cleaned = line.trim().trim_start_matches('*').trim();
            let mut parts = cleaned.split_whitespace().collect::<Vec<_>>();
            let version = parts.pop()?.parse::<u8>().ok()?;
            parts.pop()?; // state column
            let name = parts.join(" ");
            (!name.is_empty()).then_some(WslDistribution { name, version })
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn wsl_distributions() -> Vec<WslDistribution> {
    Vec::new()
}

fn command_for_runner(runner: &Runner) -> Result<Command, String> {
    match runner {
        Runner::Native => Ok(Command::new("aws")),
        Runner::Wsl { distribution } => {
            if !is_safe_identifier(distribution) {
                return Err("Invalid WSL distribution name.".into());
            }
            let mut command = Command::new("wsl.exe");
            command.args(["-d", distribution, "--", "aws"]);
            Ok(command)
        }
    }
}

fn aws_config_value(profile: &str, field: &str) -> String {
    let mut command = Command::new("aws");
    command.args(["configure", "get", field, "--profile", profile]);
    output_with_timeout(&mut command, Duration::from_secs(2))
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .unwrap_or_default()
}

fn aws_json(profile: &str, region: &str, args: &[&str]) -> Result<serde_json::Value, String> {
    let mut command = Command::new("aws");
    command
        .args(args)
        .args([
            "--profile",
            profile,
            "--region",
            region,
            "--output",
            "json",
            "--no-cli-pager",
        ])
        .env("AWS_EC2_METADATA_DISABLED", "true");
    let output = output_with_timeout(&mut command, Duration::from_secs(45))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .unwrap_or("AWS CLI exited without details.")
            .to_string();
        return Err(detail);
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|_| "AWS CLI returned an unreadable response.".to_string())
}

fn value_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value.get(key)?.as_str().map(str::to_owned)
}

fn value_port(value: &serde_json::Value, key: &str) -> Option<u16> {
    value.get(key)?.as_u64()?.try_into().ok()
}

fn rds_endpoint(
    id: String,
    label: String,
    endpoint: Option<String>,
    db_port: Option<u16>,
    endpoint_role: &str,
    engine: String,
    vpc_id: Option<String>,
) -> Option<DiscoveredRdsEndpoint> {
    let (Some(endpoint), Some(db_port)) = (endpoint, db_port) else {
        return None;
    };
    Some(DiscoveredRdsEndpoint {
        id,
        label,
        endpoint,
        db_port,
        endpoint_role: endpoint_role.to_string(),
        engine,
        vpc_id,
    })
}

fn push_rds_endpoint(
    endpoints: &mut Vec<DiscoveredRdsEndpoint>,
    candidate: Option<DiscoveredRdsEndpoint>,
) {
    let Some(candidate) = candidate else {
        return;
    };
    if endpoints.iter().any(|existing| {
        existing.endpoint == candidate.endpoint && existing.db_port == candidate.db_port
    }) {
        return;
    }
    endpoints.push(candidate);
}

fn discover_tunnel_options_blocking(
    profile: String,
    region: String,
) -> Result<TunnelDiscovery, String> {
    if !is_safe_identifier(&profile) || !is_safe_identifier(&region) {
        return Err("Invalid profile or region.".into());
    }

    // RDS is optional: a profile with access only to managed nodes must still be useful.
    let clusters = aws_json(&profile, &region, &["rds", "describe-db-clusters"])
        .unwrap_or(serde_json::Value::Null);
    let instances = aws_json(&profile, &region, &["rds", "describe-db-instances"])
        .unwrap_or(serde_json::Value::Null);
    let managed_instances = aws_json(&profile, &region, &["ssm", "describe-instance-information"])?;
    let cluster_vpcs = instances["DBInstances"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|instance| {
            let cluster_id = value_string(instance, "DBClusterIdentifier")?;
            let vpc_id = instance
                .get("DBSubnetGroup")
                .and_then(|subnet| value_string(subnet, "VpcId"))?;
            Some((cluster_id, vpc_id))
        })
        .collect::<HashMap<_, _>>();

    let mut rds_endpoints = Vec::new();
    for cluster in clusters["DBClusters"].as_array().into_iter().flatten() {
        let identifier =
            value_string(cluster, "DBClusterIdentifier").unwrap_or_else(|| "cluster".into());
        let engine = value_string(cluster, "Engine").unwrap_or_default();
        if value_string(cluster, "Status").as_deref() != Some("available") {
            continue;
        }
        let vpc_id = cluster_vpcs.get(&identifier).cloned().or_else(|| {
            cluster
                .get("DBSubnetGroup")
                .and_then(|subnet| value_string(subnet, "VpcId"))
        });
        let port = value_port(cluster, "Port");
        push_rds_endpoint(
            &mut rds_endpoints,
            rds_endpoint(
                format!("cluster:{identifier}:writer"),
                format!("{identifier} · writer"),
                value_string(cluster, "Endpoint"),
                port,
                "writer",
                engine.clone(),
                vpc_id.clone(),
            ),
        );
        push_rds_endpoint(
            &mut rds_endpoints,
            rds_endpoint(
                format!("cluster:{identifier}:reader"),
                format!("{identifier} · reader"),
                value_string(cluster, "ReaderEndpoint"),
                port,
                "reader",
                engine,
                vpc_id,
            ),
        );
    }

    for instance in instances["DBInstances"].as_array().into_iter().flatten() {
        let engine = value_string(instance, "Engine").unwrap_or_default();
        if value_string(instance, "DBInstanceStatus").as_deref() != Some("available") {
            continue;
        }
        let identifier =
            value_string(instance, "DBInstanceIdentifier").unwrap_or_else(|| "instance".into());
        let role = if instance
            .get("ReadReplicaSourceDBInstanceIdentifier")
            .is_some()
        {
            "reader"
        } else {
            "writer"
        };
        let endpoint = instance.get("Endpoint");
        let vpc_id = instance
            .get("DBSubnetGroup")
            .and_then(|subnet| value_string(subnet, "VpcId"));
        push_rds_endpoint(
            &mut rds_endpoints,
            rds_endpoint(
                format!("instance:{identifier}"),
                format!("{identifier} · {role}"),
                endpoint.and_then(|item| value_string(item, "Address")),
                endpoint.and_then(|item| value_port(item, "Port")),
                role,
                engine,
                vpc_id,
            ),
        );
    }
    rds_endpoints.sort_by(|left, right| {
        left.endpoint_role
            .cmp(&right.endpoint_role)
            .then_with(|| left.label.cmp(&right.label))
    });

    let online_nodes = managed_instances["InstanceInformationList"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|instance| value_string(instance, "PingStatus").as_deref() == Some("Online"))
        .filter_map(|instance| {
            Some((
                value_string(instance, "InstanceId")?,
                value_string(instance, "PlatformName").unwrap_or_else(|| "Managed node".into()),
                value_string(instance, "ComputerName"),
            ))
        })
        .collect::<Vec<_>>();
    let online_ids = online_nodes
        .iter()
        .map(|(id, _, _)| id.clone())
        .collect::<Vec<_>>();

    let ec2_ids = online_ids
        .iter()
        .filter(|id| id.starts_with("i-"))
        .cloned()
        .collect::<Vec<_>>();
    let ec2_instances = if ec2_ids.is_empty() {
        serde_json::Value::Null
    } else {
        let mut args = vec!["ec2", "describe-instances", "--instance-ids"];
        args.extend(ec2_ids.iter().map(String::as_str));
        aws_json(&profile, &region, &args).unwrap_or(serde_json::Value::Null)
    };

    let mut ec2_by_id = HashMap::new();
    for reservation in ec2_instances["Reservations"]
        .as_array()
        .into_iter()
        .flatten()
    {
        for instance in reservation["Instances"].as_array().into_iter().flatten() {
            let Some(id) = value_string(instance, "InstanceId") else {
                continue;
            };
            let name = instance["Tags"].as_array().and_then(|tags| {
                tags.iter().find_map(|tag| {
                    (value_string(tag, "Key").as_deref() == Some("Name"))
                        .then(|| value_string(tag, "Value"))
                        .flatten()
                })
            });
            ec2_by_id.insert(id, (name, value_string(instance, "VpcId")));
        }
    }
    let mut ssm_targets = online_nodes
        .into_iter()
        .map(|(id, platform_name, computer_name)| {
            let (name, vpc_id) = ec2_by_id.remove(&id).unwrap_or((None, None));
            let resource_type = if id.starts_with("i-") {
                "ec2"
            } else {
                "managed_node"
            };
            let default_port = if platform_name.to_ascii_lowercase().contains("windows") {
                3389
            } else {
                22
            };
            let display_name = name.or(computer_name);
            DiscoveredSsmTarget {
                label: display_name
                    .map(|name| format!("{name} · {id}"))
                    .unwrap_or_else(|| id.clone()),
                id,
                vpc_id,
                resource_type: resource_type.into(),
                platform_name,
                default_port,
            }
        })
        .collect::<Vec<_>>();
    ssm_targets.sort_by(|left, right| left.label.cmp(&right.label));

    Ok(TunnelDiscovery {
        rds_endpoints,
        ssm_targets,
    })
}

fn system_status_blocking() -> SystemStatus {
    SystemStatus {
        aws_cli: executable_available("aws"),
        session_manager_plugin: executable_available("session-manager-plugin"),
        platform: std::env::consts::OS.to_owned(),
        environment: local_environment(),
        architecture: std::env::consts::ARCH.to_owned(),
        wsl: wsl_distributions(),
    }
}

fn local_environment() -> String {
    #[cfg(target_os = "linux")]
    {
        let release = fs::read_to_string("/proc/sys/kernel/osrelease")
            .unwrap_or_default()
            .to_lowercase();
        if release.contains("microsoft") {
            return if release.contains("wsl2") || release.contains("microsoft-standard") {
                "wsl2".to_string()
            } else {
                "wsl1".to_string()
            };
        }
    }

    match std::env::consts::OS {
        "macos" => "macos".to_string(),
        "windows" => "windows".to_string(),
        "linux" => "linux".to_string(),
        other => other.to_string(),
    }
}

fn configured_profiles_blocking() -> Result<Vec<AwsProfile>, String> {
    let mut command = Command::new("aws");
    command.args(["configure", "list-profiles"]);
    let output = output_with_timeout(&mut command, Duration::from_secs(3))
        .map_err(|_| "AWS CLI not found in PATH.".to_string())?;
    if !output.status.success() {
        return Err("Unable to list profiles configured in AWS CLI.".into());
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|profile| is_safe_identifier(profile))
        .map(|profile| {
            let region = aws_config_value(profile, "region");
            let sso_session = aws_config_value(profile, "sso_session");
            let auth = if sso_session.is_empty() {
                "AWS CLI"
            } else {
                "SSO"
            }
            .to_string();
            AwsProfile {
                name: profile.to_string(),
                region: if region.is_empty() {
                    "Region not configured".to_string()
                } else {
                    region
                },
                auth,
                status: "unknown".to_string(),
                account_id: None,
            }
        })
        .collect())
}

#[tauri::command]
async fn system_status() -> SystemStatus {
    tauri::async_runtime::spawn_blocking(system_status_blocking)
        .await
        .unwrap_or(SystemStatus {
            aws_cli: false,
            session_manager_plugin: false,
            platform: std::env::consts::OS.to_owned(),
            environment: local_environment(),
            architecture: std::env::consts::ARCH.to_owned(),
            wsl: Vec::new(),
        })
}

#[tauri::command]
fn runner_status(runner: Runner) -> RunnerStatus {
    RunnerStatus {
        aws_cli: aws_available(&runner),
        session_manager_plugin: session_manager_available(&runner),
    }
}

#[tauri::command]
async fn list_configured_profiles() -> Result<Vec<AwsProfile>, String> {
    tauri::async_runtime::spawn_blocking(configured_profiles_blocking)
        .await
        .map_err(|error| format!("Unable to load profiles: {error}"))?
}

fn discover_profiles_blocking() -> Result<Vec<AwsProfile>, String> {
    let mut profiles = configured_profiles_blocking()?;
    for profile in &mut profiles {
        let mut command = Command::new("aws");
        command
            .args([
                "sts",
                "get-caller-identity",
                "--profile",
                &profile.name,
                "--output",
                "json",
                "--no-cli-pager",
            ])
            .env("AWS_EC2_METADATA_DISABLED", "true");
        match output_with_timeout(&mut command, Duration::from_secs(5)) {
            Ok(result) if result.status.success() => {
                profile.status = "connected".to_string();
                profile.account_id = serde_json::from_slice::<serde_json::Value>(&result.stdout)
                    .ok()
                    .and_then(|value| value.get("Account")?.as_str().map(str::to_owned));
            }
            _ if profile.auth == "SSO" => profile.status = "expired".to_string(),
            _ => profile.status = "unavailable".to_string(),
        }
    }
    Ok(profiles)
}

#[tauri::command]
async fn discover_profiles() -> Result<Vec<AwsProfile>, String> {
    tauri::async_runtime::spawn_blocking(discover_profiles_blocking)
        .await
        .map_err(|error| format!("Unable to check profiles: {error}"))?
}

#[tauri::command]
async fn discover_tunnel_options(
    profile: String,
    region: String,
) -> Result<TunnelDiscovery, String> {
    tauri::async_runtime::spawn_blocking(move || discover_tunnel_options_blocking(profile, region))
        .await
        .map_err(|error| format!("Unable to discover destinations: {error}"))?
}

#[tauri::command]
async fn list_approved_destinations(app: AppHandle) -> Result<Vec<ApprovedDestination>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(load_local_config(&app)?.approved_destinations))
        .await
        .map_err(|error| format!("Unable to read approved destinations: {error}"))?
}

#[tauri::command]
fn approve_destination(
    app: AppHandle,
    input: ApprovalInput,
) -> Result<ApprovedDestination, String> {
    if !valid_approval(&input) {
        return Err("Approved destination data is invalid.".into());
    }
    let destination = ApprovedDestination {
        id: format!(
            "{}::{}::{}::{}::{}",
            input.profile, input.region, input.endpoint, input.db_port, input.ssm_target
        ),
        label: input.label.trim().to_owned(),
        profile: input.profile,
        region: input.region,
        endpoint: input.endpoint,
        db_port: input.db_port,
        endpoint_role: input.endpoint_role,
        ssm_target: input.ssm_target,
        resource_type: input.resource_type,
        connection_mode: input.connection_mode,
    };
    let mut config = load_local_config(&app)?;
    config
        .approved_destinations
        .retain(|existing| existing.id != destination.id);
    config.approved_destinations.push(destination.clone());
    save_local_config(&app, &config)?;
    Ok(destination)
}

#[tauri::command]
fn remove_approved_destination(app: AppHandle, id: String) -> Result<(), String> {
    let mut config = load_local_config(&app)?;
    let before = config.approved_destinations.len();
    config
        .approved_destinations
        .retain(|destination| destination.id != id);
    if config.approved_destinations.len() == before {
        return Err("Approved destination not found.".into());
    }
    save_local_config(&app, &config)
}

#[tauri::command]
fn list_activity_events(app: AppHandle) -> Result<Vec<ActivityEvent>, String> {
    Ok(load_local_config(&app)?.activity_events)
}

#[tauri::command]
fn append_activity_event(app: AppHandle, event: ActivityEvent) -> Result<ActivityEvent, String> {
    let valid = !event.id.trim().is_empty()
        && event.id.len() <= 180
        && !event.time.trim().is_empty()
        && event.time.len() <= 32
        && !event.action.trim().is_empty()
        && event.action.len() <= 100
        && event.detail.len() <= 600
        && matches!(event.status.as_str(), "success" | "error" | "info");
    if !valid {
        return Err("The local event is invalid.".into());
    }

    let mut config = load_local_config(&app)?;
    config.activity_events.retain(|item| item.id != event.id);
    config.activity_events.insert(0, event.clone());
    config.activity_events.truncate(200);
    save_local_config(&app, &config)?;
    Ok(event)
}

#[tauri::command]
fn reset_local_state(app: AppHandle, state: tauri::State<TunnelState>) -> Result<(), String> {
    let mut tunnels = state
        .children
        .lock()
        .map_err(|_| "Tunnel state is unavailable.")?;
    for (_, mut tunnel) in tunnels.drain() {
        terminate_process_tree(&mut tunnel.child)?;
    }
    drop(tunnels);

    let path = approval_config_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("Unable to clear local data: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn suggest_local_port(runner: Runner) -> Result<PortSuggestion, String> {
    match runner {
        Runner::Native => next_native_port()
            .map(|port| PortSuggestion {
                port,
                message: format!(
                    "Port {port} is available on 127.0.0.1; opening the tunnel will validate it again."
                ),
            })
            .ok_or_else(|| format!("No port is available between {PORT_START} and {PORT_END}.")),
        Runner::Wsl { distribution } => {
            if !is_safe_identifier(&distribution) {
                return Err("Invalid WSL distribution name.".into());
            }
            Ok(PortSuggestion {
                port: PORT_START,
                message: format!("WSL selected: the port will be validated inside {distribution} when opening the tunnel and will increment after a collision."),
            })
        }
    }
}

#[tauri::command]
fn start_sso_login(profile: String, runner: Runner) -> Result<(), String> {
    if !is_safe_identifier(&profile) {
        return Err("Invalid profile.".into());
    }
    let mut command = command_for_runner(&runner)?;
    command.args(["sso", "login", "--profile", &profile]);
    command
        .spawn()
        .map_err(|error| format!("Unable to start SSO login: {error}"))?;
    Ok(())
}

#[tauri::command]
fn install_session_manager_plugin(runner: Runner) -> Result<PluginInstallResult, String> {
    match runner {
        Runner::Native => install_native_session_manager_plugin(),
        Runner::Wsl { distribution } => {
            if !is_safe_identifier(&distribution) {
                return Err("Invalid WSL distribution name.".into());
            }
            start_wsl_session_manager_install(&distribution)
        }
    }
}

#[tauri::command]
fn start_tunnel(
    app: AppHandle,
    state: tauri::State<TunnelState>,
    request: TunnelRequest,
) -> Result<ActiveTunnel, String> {
    for value in [
        &request.profile,
        &request.region,
        &request.target,
        &request.host,
    ] {
        if !is_safe_identifier(value) {
            return Err("The request contains an invalid identifier.".into());
        }
    }
    if request.remote_port == 0 {
        return Err("The remote port must be valid.".into());
    }
    let allowed = load_local_config(&app)?
        .approved_destinations
        .into_iter()
        .any(|destination| {
            destination.profile == request.profile
                && destination.region == request.region
                && destination.ssm_target == request.target
                && destination.endpoint == request.host
                && destination.db_port == request.remote_port
                && destination.connection_mode == request.connection_mode
        });
    if !allowed {
        return Err(
            "The resource and SSM target must be approved locally before opening a tunnel.".into(),
        );
    }
    if !session_manager_available(&request.runner) {
        return Err("session-manager-plugin is not installed in the selected runner.".into());
    }

    for local_port in PORT_START..=PORT_END {
        if matches!(&request.runner, Runner::Native) && !port_is_available(local_port) {
            continue;
        }
        let (document, parameters) = match request.connection_mode.as_str() {
            "managed_node" => (
                "AWS-StartPortForwardingSession",
                format!(
                    "portNumber={},localPortNumber={}",
                    request.remote_port, local_port
                ),
            ),
            "remote_host" => (
                "AWS-StartPortForwardingSessionToRemoteHost",
                format!(
                    "host={},portNumber={},localPortNumber={}",
                    request.host, request.remote_port, local_port
                ),
            ),
            _ => return Err("The requested connection mode is invalid.".into()),
        };
        let args = [
            "ssm",
            "start-session",
            "--target",
            &request.target,
            "--document-name",
            document,
            "--parameters",
            &parameters,
            "--profile",
            &request.profile,
            "--region",
            &request.region,
            "--no-cli-pager",
        ];
        let mut command = command_for_runner(&request.runner)?;
        isolate_tunnel_process(&mut command);
        let mut child = command
            .args(args)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Unable to start the SSM session: {error}"))?;
        thread::sleep(Duration::from_millis(850));
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
        {
            let id = format!("{}:{local_port}", request.target);
            state
                .children
                .lock()
                .map_err(|_| "Tunnel state is unavailable.")?
                .insert(id.clone(), ManagedTunnel { child, local_port });
            return Ok(ActiveTunnel {
                id,
                local_port,
                local_host: "localhost".into(),
            });
        }
        let output = child
            .wait_with_output()
            .map_err(|error| format!("Unable to read the SSM session result: {error}"))?;
        let detail = String::from_utf8_lossy(&output.stderr);
        let collision = detail.contains("Address already in use")
            || detail.contains("address already in use")
            || detail.contains("port is already allocated");
        if !collision {
            let summary = detail
                .lines()
                .next()
                .unwrap_or("The SSM session ended before opening the tunnel.");
            return Err(format!("The SSM session did not start: {summary}"));
        }
    }
    Err(format!(
        "Unable to reserve a port between {PORT_START} and {PORT_END} in the selected runner."
    ))
}

#[tauri::command]
fn stop_tunnel(state: tauri::State<TunnelState>, id: String) -> Result<(), String> {
    let mut tunnel = state
        .children
        .lock()
        .map_err(|_| "Tunnel state is unavailable.")?
        .remove(&id)
        .ok_or_else(|| "Tunnel not found.".to_string())?;
    terminate_process_tree(&mut tunnel.child)?;
    if !wait_for_port_release(tunnel.local_port) {
        return Err(format!(
            "The process ended, but local port {} is still in use.",
            tunnel.local_port
        ));
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(TunnelState::default())
        .invoke_handler(tauri::generate_handler![
            system_status,
            runner_status,
            list_configured_profiles,
            discover_profiles,
            discover_tunnel_options,
            list_approved_destinations,
            approve_destination,
            remove_approved_destination,
            list_activity_events,
            append_activity_event,
            reset_local_state,
            suggest_local_port,
            start_sso_login,
            install_session_manager_plugin,
            start_tunnel,
            stop_tunnel,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AWS Tunnel Desk");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn stopping_a_tunnel_terminates_its_process_group() {
        let mut command = Command::new("sh");
        command.args(["-c", "sleep 30 & wait"]);
        isolate_tunnel_process(&mut command);
        let mut child = command.spawn().expect("process tree should start");
        let process_group = -(child.id() as i32);

        thread::sleep(Duration::from_millis(100));
        terminate_process_tree(&mut child).expect("process tree should stop");

        assert!(
            child
                .try_wait()
                .expect("process status should be readable")
                .is_some(),
            "the parent process must be reaped"
        );
        assert_ne!(
            unsafe { libc::kill(process_group, 0) },
            0,
            "no descendant may remain in the tunnel process group"
        );
    }

    #[test]
    fn legacy_configuration_loads_with_an_empty_history() {
        let legacy = r#"{
          "approved_destinations": [{
            "id": "profile::sa-east-1::db.example::i-123",
            "label": "Reader",
            "profile": "profile",
            "region": "sa-east-1",
            "endpoint": "db.example",
            "dbPort": 5432,
            "endpointRole": "reader",
            "ssmTarget": "i-123"
          }]
        }"#;

        let config: LocalConfig = serde_json::from_str(legacy).expect("legacy config should load");
        assert_eq!(config.approved_destinations.len(), 1);
        assert_eq!(config.approved_destinations[0].resource_type, "rds");
        assert_eq!(
            config.approved_destinations[0].connection_mode,
            "remote_host"
        );
        assert!(config.activity_events.is_empty());
    }

    #[test]
    fn managed_nodes_can_be_approved_for_direct_port_forwarding() {
        let input = ApprovalInput {
            label: "application · i-123".into(),
            profile: "production".into(),
            region: "sa-east-1".into(),
            endpoint: "i-123".into(),
            db_port: 22,
            endpoint_role: "service".into(),
            ssm_target: "i-123".into(),
            resource_type: "ec2".into(),
            connection_mode: "managed_node".into(),
        };

        assert!(valid_approval(&input));
    }
}
