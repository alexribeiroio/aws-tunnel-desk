import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createScope, createTimeline, stagger } from "animejs";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ACCOUNT_CHECK_INTERVAL_MS, accountCheckIsDue } from "./accountRefresh";
import { getInitialLocale, localeTags, localizeNode, translateText } from "./i18n";
import { markOnboardingSeen, onboardingIsDue, onboardingSteps } from "./onboarding";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  CheckCircle,
  ClipboardText,
  Cloud,
  Compass,
  Copy,
  Database,
  DesktopTower,
  DownloadSimple,
  GearSix,
  GlobeSimple,
  ListMagnifyingGlass,
  ListBullets,
  PlayCircle,
  PlugsConnected,
  ShieldCheck,
  SquaresFour,
  StopCircle,
  TerminalWindow,
  Trash,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

const tourIcons = { Cloud, UsersThree, ShieldCheck, PlugsConnected, ClipboardText };

function OnboardingTour({ step, total, current, locale, onNext, onBack, onSkip, onFinish }) {
  const Icon = tourIcons[step.icon] || Compass;
  const isLast = current === total - 1;
  return localizeNode(<div className="approval-overlay tour-overlay" role="dialog" aria-modal="true" aria-label="AWS Tunnel Desk tutorial">
    <div className="approval-dialog compact-dialog tour-dialog">
      <div className="dialog-heading"><div><span>GETTING STARTED</span><h2>{step.title}</h2></div><button type="button" className="icon-button" onClick={onSkip} aria-label="Skip tutorial"><X size={20} /></button></div>
      <div className="tour-body"><div className="tour-icon"><Icon size={30} weight="duotone" /></div><p>{step.description}</p></div>
      <div className="tour-progress" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>{Array.from({ length: total }).map((_, index) => <span key={index} className={index === current ? "active" : index < current ? "done" : ""} />)}</div>
      <div className="dialog-actions tour-actions"><span className="tour-count">{`Step ${current + 1} of ${total}`}</span>{current > 0 && <button type="button" className="secondary-action" onClick={onBack}><CaretLeft size={16} /> Back</button>}{!isLast && <button type="button" className="secondary-action" onClick={onSkip}>Skip</button>}<button type="button" className="approve-button" onClick={isLast ? onFinish : onNext}>{isLast ? <>Start using it <CheckCircle size={18} weight="fill" /></> : <>Next <CaretRight size={16} /></>}</button></div>
    </div>
  </div>, locale);
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const runnerPayload = (runner) => runner === "native" ? { kind: "native" } : { kind: "wsl", distribution: runner };

function copyText(value) { navigator.clipboard?.writeText(value); }
function StatusDot({ status }) { return <span className={`status-dot ${status}`} aria-label={status} />; }
function accountStatus(profiles) {
  if (profiles.some((profile) => profile.status === "connected")) return "connected";
  if (profiles.some((profile) => profile.status === "expired")) return "expired";
  if (profiles.some((profile) => profile.status === "unavailable")) return "unavailable";
  return "unknown";
}
function getInitialDestinationView() {
  const saved = globalThis.localStorage?.getItem("aws-tunnel-desk.destination-view");
  return saved === "list" ? "list" : "cards";
}
function destinationStatus(destination, activeTunnels, profiles) {
  if (activeTunnels[destination.id]) return "connected";
  const profile = profiles.find((item) => item.name === destination.profile);
  return profile?.status === "connected" ? "disconnected" : "auth";
}
function DestinationLibrary({ destinations, activeTunnels, profiles, viewMode, onViewMode, onOpen, onApprove, locale }) {
  const connectedCount = Object.keys(activeTunnels).length;
  const reducedMotion = useReducedMotion();
  return localizeNode(<motion.div className="destination-library-shell" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
    <motion.div className="destination-toolbar" initial={reducedMotion ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .32 }}><div><strong>{`${destinations.length} destination(s)`}</strong><span><i className="status-signal connected" /> {`${connectedCount} connected`}</span></div><div className="destination-toolbar-actions"><div className="view-switch" role="group" aria-label="Destination view"><motion.button className={viewMode === "list" ? "active" : ""} onClick={() => onViewMode("list")} aria-label="Show as list" whileTap={{ scale: .82 }}><ListBullets size={18} /></motion.button><motion.button className={viewMode === "cards" ? "active" : ""} onClick={() => onViewMode("cards")} aria-label="Show as cards" whileTap={{ scale: .82 }}><SquaresFour size={18} /></motion.button></div><motion.button className="secondary-action" onClick={onApprove} whileHover={{ y: -2 }} whileTap={{ scale: .96 }}><ShieldCheck size={17} /> Approve resource</motion.button></div></motion.div>
    <AnimatePresence mode="popLayout" initial={!reducedMotion}>{!destinations.length ? <motion.div key="empty" className="destination-empty" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }}><motion.div animate={reducedMotion ? {} : { y: [0, -7, 0], rotate: [0, -4, 4, 0] }} transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 1 }}><ShieldCheck size={34} weight="duotone" /></motion.div><strong>No approved destination</strong><span>Choose an AWS profile and approve the first resource to get started.</span><motion.button className="secondary-action" onClick={onApprove} whileHover={{ scale: 1.03 }} whileTap={{ scale: .96 }}>Approve first resource</motion.button></motion.div> : <motion.div layout className={`destination-library ${viewMode}`} key="library"><AnimatePresence mode="popLayout">{destinations.map((item, index) => { const status = destinationStatus(item, activeTunnels, profiles); const statusLabel = status === "connected" ? "Connected" : status === "auth" ? "Authentication required" : "Disconnected"; const type = item.resourceType === "ec2" ? "EC2" : item.resourceType === "managed_node" ? "Managed node" : "RDS"; return <motion.article layout className={`destination-item ${status} ${activeTunnels[item.id] ? "active" : ""}`} key={item.id} initial={reducedMotion ? false : { opacity: 0, y: 18, rotateX: -5 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, scale: .94 }} transition={{ layout: { type: "spring", stiffness: 330, damping: 30 }, delay: reducedMotion ? 0 : Math.min(index * .045, .25) }} whileHover={reducedMotion ? {} : { y: -4, rotateX: 1 }} whileTap={{ scale: .985 }}>{status === "connected" && <span className="connection-sparks" aria-hidden="true"><i /><i /><i /></span>}<button className="destination-main" onClick={() => onOpen(item)}><motion.div className="destination-icon" animate={status === "connected" && !reducedMotion ? { boxShadow: ["0 0 0 rgba(67,220,141,0)", "0 0 22px rgba(67,220,141,.22)", "0 0 0 rgba(67,220,141,0)"] } : {}} transition={{ duration: 2.2, repeat: Infinity }} >{item.resourceType === "rds" ? <Database size={22} weight="duotone" /> : <DesktopTower size={22} weight="duotone" />}</motion.div><div className="destination-copy"><div><strong>{item.label}</strong><span className={`connection-state ${status}`}><i />{statusLabel}</span></div><p>{item.endpoint}:{item.dbPort}</p><small>{type} · {item.profile} · {item.region}</small></div><span className="destination-open">{status === "connected" ? "View tunnel" : "Connect"}<ArrowSquareOut size={15} /></span></button></motion.article>; })}</AnimatePresence></motion.div>}</AnimatePresence>
  </motion.div>, locale);
}
function LoadingOrb({ size = "normal" }) {
  return <span className={`loading-orb ${size}`} aria-hidden="true"><span /><span /><span /></span>;
}
function LoadingLabel({ active, loadingText, children }) {
  return active ? <><LoadingOrb size="small" /> {loadingText}</> : children;
}
function RequirementCard({ ready, title, description, command, action, locale }) {
  return <article className={`checkup-requirement ${ready ? "ready" : "missing"}`}>
    <div className="requirement-status">{ready ? <CheckCircle size={21} weight="fill" /> : <WarningCircle size={21} weight="fill" />}</div>
    <div className="requirement-copy"><div><strong>{title}</strong><span>{translateText(locale, ready ? "Ready" : "Setup required")}</span></div><p>{description}</p>{!ready && command && <div className="setup-command"><code>{command}</code><button type="button" onClick={() => copyText(command)} aria-label={`${translateText(locale, "Copy command for")} ${title}`}><Copy size={17} /></button></div>}{!ready && action}</div>
  </article>;
}
function LanguagePicker({ locale, onChange, compact = false }) {
  const label = translateText(locale, "Language");
  return <label className={`language-picker ${compact ? "compact" : ""}`}><GlobeSimple size={16} /><span className="sr-only">{label}</span><select value={locale} onChange={(event) => onChange(event.target.value)} aria-label={label}><option value="pt">Portuguese</option><option value="en">English</option><option value="es">Spanish</option></select><CaretDown size={13} /></label>;
}
function environmentGuide(runtime, runner) {
  const selectedWsl = runner === "native" ? null : runtime.wsl?.find((item) => item.name === runner);
  const environment = selectedWsl ? `wsl${selectedWsl.version}` : runtime.environment || runtime.platform || "linux";
  const architecture = runtime.architecture === "aarch64" ? "aarch64" : "x86_64";
  const linuxAwsUrl = `https://awscli.amazonaws.com/awscli-exe-linux-${architecture}.zip`;

  if (environment === "windows") return {
    id: "windows", label: "Native Windows", detail: "AWS CLI and Session Manager Plugin installed on Windows and available in PATH.",
    awsCommand: "msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi",
    verifyCommand: "aws --version && session-manager-plugin",
  };
  if (environment === "macos") return {
    id: "macos", label: "macOS", detail: "Signed native packages and macOS administrator authorization.",
    awsCommand: "curl https://awscli.amazonaws.com/AWSCLIV2.pkg -o /tmp/AWSCLIV2.pkg && sudo installer -pkg /tmp/AWSCLIV2.pkg -target /",
    verifyCommand: "aws --version && session-manager-plugin",
  };
  if (environment === "wsl1" || environment === "wsl2") return {
    id: environment, label: environment === "wsl2" ? "WSL2" : "WSL1", detail: `Dependencies must exist inside the ${runner === "native" ? "currently running" : runner} distribution, not only on Windows.`,
    awsCommand: `curl ${linuxAwsUrl} -o /tmp/awscliv2.zip && unzip -q /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install`,
    verifyCommand: "aws --version && session-manager-plugin",
  };
  return {
    id: "linux", label: "Linux", detail: "Dependencies installed on the system and available in the graphical session PATH.",
    awsCommand: `curl ${linuxAwsUrl} -o /tmp/awscliv2.zip && unzip -q /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install`,
    verifyCommand: "aws --version && session-manager-plugin",
  };
}
function SidebarItem({ icon: Icon, children, active, onClick }) {
  return <motion.button className={`side-nav-item ${active ? "active" : ""}`} onClick={onClick} title={children} whileHover={{ x: 4 }} whileTap={{ scale: .97 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}><Icon size={20} weight={active ? "fill" : "regular"} /><span>{children}</span></motion.button>;
}

function profileStatusLabel(status) {
  if (status === "connected") return "Connected";
  if (status === "expired") return "Session expired";
  if (status === "unavailable") return "Unavailable";
  return "Not checked";
}

function AccountProfileWorkspace({ account, detailMode, selectedProfile, destinations, hasActiveTunnels, loading, loginProfile, locale, onSelectProfile, onRefresh, onLogin, onApprove, onViewTunnel }) {
  const profiles = account?.profiles || [];
  const connectedProfiles = profiles.filter((profile) => profile.status === "connected");
  const accountDestinations = destinations.filter((destination) => profiles.some((profile) => profile.name === destination.profile));
  const focusedProfile = detailMode === "profile" && profiles.some((profile) => profile.name === selectedProfile?.name) ? selectedProfile : null;
  const profileDestinations = focusedProfile ? accountDestinations.filter((destination) => destination.profile === focusedProfile.name) : [];
  const title = focusedProfile?.name || (account?.accountId ? `AWS account ${account.accountId}` : "Account not identified yet");
  const configuredCommand = focusedProfile ? `aws configure sso --profile ${focusedProfile.name}` : "aws configure sso";
  const loginCommand = focusedProfile ? `aws sso login --profile ${focusedProfile.name}` : "aws sso login --profile <profile>";
  const verifyCommand = focusedProfile ? `aws sts get-caller-identity --profile ${focusedProfile.name}` : "aws sts get-caller-identity --profile <profile>";

  return localizeNode(<>
    <header className="workspace-header section-page-header account-workspace-header">
      <div className="eyebrow"><span>→</span> {focusedProfile ? "Profile details" : "AWS account overview"}</div>
      <div className="header-line"><div className="header-copy"><h1>{title}</h1><p><UsersThree size={16} /> {focusedProfile ? `${focusedProfile.auth} · ${focusedProfile.region}` : "Select a profile below to inspect authentication and setup."}</p></div>{hasActiveTunnels && <button className="secondary-action active-tunnel-link" onClick={onViewTunnel}><PlugsConnected size={17} /> View active tunnel</button>}<button className="secondary-action" onClick={onRefresh} disabled={loading}><LoadingLabel active={loading} loadingText="Checking"><ArrowsClockwise size={18} /> Check sessions</LoadingLabel></button></div>
    </header>
    <div className="content-scroll account-workspace-content">
      <section className="account-overview-card">
        <div className="account-overview-heading"><div className={`account-orbit ${connectedProfiles.length ? "connected" : "attention"}`}><Cloud size={28} weight="duotone" /><span /></div><div><small>{focusedProfile ? "SELECTED PROFILE" : "SELECTED ACCOUNT"}</small><h2>{focusedProfile ? profileStatusLabel(focusedProfile.status) : `${connectedProfiles.length} of ${profiles.length} profiles connected`}</h2><p>{focusedProfile ? "Use the actions and commands below to configure or restore this AWS CLI profile." : "This account groups AWS CLI profiles that resolved to the same AWS account identity."}</p></div></div>
        <div className="account-metrics"><div><small>ACCOUNT ID</small><strong>{account?.accountId || "Not identified"}</strong></div><div><small>PROFILES</small><strong>{profiles.length}</strong></div><div><small>APPROVED RESOURCES</small><strong>{accountDestinations.length}</strong></div></div>
      </section>

      <section className="setup-path-card">
        <div className="section-title"><h2>Access setup</h2><span>Follow these steps in order</span></div>
        <div className="setup-path">
          <article className="setup-step ready"><span>1</span><div><small>PROFILE</small><strong>AWS CLI profile configured</strong><p>{profiles.length ? `${profiles.length} profile(s) found for this account.` : "Create the first AWS CLI SSO profile."}</p></div><CheckCircle size={22} weight="fill" /></article>
          <article className={`setup-step ${connectedProfiles.length ? "ready" : "attention"}`}><span>2</span><div><small>AUTHENTICATION</small><strong>{connectedProfiles.length ? "AWS session available" : "Authentication required"}</strong><p>{connectedProfiles.length ? "At least one profile can call AWS now." : "Connect an SSO profile and check the session again."}</p></div>{connectedProfiles.length ? <CheckCircle size={22} weight="fill" /> : <WarningCircle size={22} weight="fill" />}</article>
          <article className={`setup-step ${accountDestinations.length ? "ready" : "next"}`}><span>3</span><div><small>RESOURCE ACCESS</small><strong>{accountDestinations.length ? "Resources approved locally" : "Approve the first resource"}</strong><p>{accountDestinations.length ? `${accountDestinations.length} resource(s) ready for tunnel selection.` : "Discover RDS, EC2, or managed nodes using a connected profile."}</p></div>{accountDestinations.length ? <CheckCircle size={22} weight="fill" /> : <PlayCircle size={22} weight="fill" />}</article>
        </div>
      </section>

      <div className="account-detail-grid">
        <section className="profile-picker-card"><div className="section-title"><h2>Profiles in this account</h2><span>{`${profiles.length} found`}</span></div><div className="account-profile-list">{profiles.map((profile) => <button type="button" key={profile.name} className={focusedProfile?.name === profile.name ? "selected" : ""} onClick={() => onSelectProfile(profile)}><StatusDot status={profile.status} /><span><strong>{profile.name}</strong><small>{profile.auth} · {profile.region}</small></span><span className={`profile-status ${profile.status}`}>{profileStatusLabel(profile.status)}</span><ArrowSquareOut size={16} /></button>)}</div></section>
        <section className="profile-detail-card">{focusedProfile ? <><div className="profile-detail-head"><div><small>PROFILE CONFIGURATION</small><h2>{focusedProfile.name}</h2></div><span className={`profile-status ${focusedProfile.status}`}>{profileStatusLabel(focusedProfile.status)}</span></div><dl><div><dt>Authentication</dt><dd>{focusedProfile.auth}</dd></div><div><dt>Region</dt><dd>{focusedProfile.region || "Not configured"}</dd></div><div><dt>Account</dt><dd>{focusedProfile.accountId || "Not identified"}</dd></div><div><dt>Approved resources</dt><dd>{profileDestinations.length}</dd></div></dl><div className="profile-actions">{focusedProfile.auth === "SSO" && <button className="secondary-action" onClick={() => onLogin(focusedProfile)} disabled={Boolean(loginProfile)}><LoadingLabel active={loginProfile === focusedProfile.name} loadingText="Opening SSO">{focusedProfile.status === "connected" ? "Reauthenticate" : "Connect SSO"}</LoadingLabel></button>}<button className="approve-button" onClick={onApprove} disabled={focusedProfile.status !== "connected"}><ShieldCheck size={17} /> Discover and approve resource</button></div><div className="command-stack"><CommandRow locale={locale} label="Configure profile" command={configuredCommand} /><CommandRow locale={locale} label="Connect SSO" command={loginCommand} /><CommandRow locale={locale} label="Verify identity" command={verifyCommand} /></div></> : <div className="profile-detail-empty"><UsersThree size={34} weight="duotone" /><strong>Select a profile</strong><p>Choose a profile from this account to see its Region, authentication status, approved resources, and setup commands.</p></div>}</section>
      </div>
    </div>
  </>, locale);
}

function CommandRow({ locale, label, command }) {
  const translatedLabel = translateText(locale, label);
  return <div className="profile-command"><span>{translatedLabel}</span><code>{command}</code><button type="button" onClick={() => copyText(command)} aria-label={`${translateText(locale, "Copy command for")} ${translatedLabel}`}><Copy size={16} /></button></div>;
}

export function App() {
  const appRoot = useRef(null);
  const accountCheckInFlight = useRef(false);
  const lastAccountCheckAt = useRef(0);
  const reducedMotion = useReducedMotion();
  const [locale, setLocale] = useState(getInitialLocale);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [activeSection, setActiveSection] = useState("tunnels");
  const [port, setPort] = useState(15432);
  const [runner, setRunner] = useState("native");
  const [activeTunnels, setActiveTunnels] = useState({});
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("No credentials or secrets were collected or stored.");
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Preparing local environment");
  const [runtime, setRuntime] = useState({ awsCli: false, sessionManagerPlugin: false, wsl: [] });
  const [approvedDestinations, setApprovedDestinations] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState("");
  const [discovery, setDiscovery] = useState({ rdsEndpoints: [], ssmTargets: [] });
  const [approval, setApproval] = useState({ resourceId: "", targetId: "", remotePort: 22 });
  const [events, setEvents] = useState([]);
  const [loginProfile, setLoginProfile] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pluginPromptOpen, setPluginPromptOpen] = useState(false);
  const [installingPlugin, setInstallingPlugin] = useState(false);
  const [runnerLoading, setRunnerLoading] = useState(false);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [removingApproval, setRemovingApproval] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState("");
  const [checkupOpen, setCheckupOpen] = useState(true);
  const [portReady, setPortReady] = useState(false);
  const [collapsedAccounts, setCollapsedAccounts] = useState(() => new Set());
  const [destinationView, setDestinationView] = useState(getInitialDestinationView);
  const [selectedAccountKey, setSelectedAccountKey] = useState(null);
  const [profileDetailMode, setProfileDetailMode] = useState("account");
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const visibleProfiles = useMemo(() => profiles.filter((profile) => profile.name.toLowerCase().includes(search.toLowerCase())), [profiles, search]);
  const profileGroups = useMemo(() => {
    const groups = new Map();
    for (const profile of visibleProfiles) {
      const key = profile.accountId || "unidentified";
      if (!groups.has(key)) groups.set(key, { key, accountId: profile.accountId, profiles: [] });
      groups.get(key).profiles.push(profile);
    }
    return [...groups.values()].sort((left, right) => {
      if (!left.accountId) return 1;
      if (!right.accountId) return -1;
      return left.accountId.localeCompare(right.accountId);
    });
  }, [visibleProfiles]);
  const selectedAccount = useMemo(() => {
    const currentProfile = profiles.find((profile) => profile.name === selectedProfile?.name) || selectedProfile;
    const fallbackKey = currentProfile?.accountId || (currentProfile ? "unidentified" : null);
    const selectedKeyStillExists = profiles.some((profile) => (profile.accountId || "unidentified") === selectedAccountKey);
    const key = selectedKeyStillExists ? selectedAccountKey : fallbackKey;
    if (!key) return null;
    const accountProfiles = profiles.filter((profile) => (profile.accountId || "unidentified") === key);
    return accountProfiles.length ? { key, accountId: key === "unidentified" ? null : key, profiles: accountProfiles } : null;
  }, [profiles, selectedAccountKey, selectedProfile]);
  const destination = selectedDestination;
  const discoveredResources = useMemo(() => [
    ...discovery.rdsEndpoints.map((item) => ({ ...item, resourceType: "rds", connectionMode: "remote_host", host: item.endpoint, remotePort: item.dbPort })),
    ...discovery.ssmTargets.map((item) => ({ ...item, resourceType: item.resourceType || "managed_node", connectionMode: "managed_node", host: item.id, remotePort: item.defaultPort || 22 })),
  ], [discovery]);
  const selectedResource = useMemo(() => discoveredResources.find((item) => item.id === approval.resourceId) || null, [discoveredResources, approval.resourceId]);
  const compatibleTargets = useMemo(() => selectedResource?.connectionMode === "managed_node"
    ? discovery.ssmTargets.filter((target) => target.id === selectedResource.id)
    : discovery.ssmTargets.filter((target) => !selectedResource?.vpcId || target.vpcId === selectedResource.vpcId), [discovery.ssmTargets, selectedResource]);
  const selectedTarget = useMemo(() => compatibleTargets.find((item) => item.id === approval.targetId) || null, [compatibleTargets, approval.targetId]);
  const isWindows = runtime.platform === "windows";
  const pluginMissing = runtime.awsCli && !runtime.sessionManagerPlugin;
  const activeTunnelCount = Object.keys(activeTunnels).length;
  const activeEntry = selectedDestination ? activeTunnels[selectedDestination.id] : undefined;
  const tunnelState = activeEntry ? "active" : "stopped";
  const destinationTitle = destination?.label?.split(" · ")[0] || "No approved destination";
  const destinationType = !destination ? "—" : destination.resourceType === "ec2" ? "EC2" : destination.resourceType === "managed_node" ? "Managed node" : "RDS";
  const guide = useMemo(() => environmentGuide(runtime, runner), [runtime, runner]);
  const checkupReady = runtime.awsCli && runtime.sessionManagerPlugin && profiles.length > 0;
  const checkupCount = [runtime.awsCli, runtime.sessionManagerPlugin, profiles.length > 0].filter(Boolean).length;
  const activeLoadingMessage = initializing ? "Preparing local environment" : loading ? loadingMessage : runnerLoading ? "Validating runner and local port" : discoveryLoading ? "Discovering visible AWS resources" : loginProfile ? `Starting SSO for ${loginProfile}` : tunnelBusy || (approvalSaving ? "Saving local approval" : "") || (removingApproval ? "Removing local approval" : "") || (installingPlugin ? "Preparing Session Manager Plugin" : "") || (resetting ? "Clearing local data" : "");

  useEffect(() => {
    localStorage.setItem("aws-tunnel-desk.locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    localStorage.setItem("aws-tunnel-desk.destination-view", destinationView);
  }, [destinationView]);

  useEffect(() => {
    if (initializing || checkupOpen) return;
    if (onboardingIsDue()) {
      setTourStep(0);
      setTourOpen(true);
    }
  }, [checkupOpen, initializing]);

  function openTour() {
    setTourStep(0);
    setTourOpen(true);
  }

  function closeTour() {
    markOnboardingSeen();
    setTourOpen(false);
  }

  useEffect(() => {
    const content = appRoot.current?.querySelector(".content-scroll");
    content?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSection, profileDetailMode, selectedAccountKey, selectedProfile?.name]);

  useEffect(() => {
    if (reducedMotion || initializing || !appRoot.current) return undefined;
    const scope = createScope({ root: appRoot }).add(() => {
      createTimeline()
        .add(".workspace-header .eyebrow", { opacity: { from: 0 }, x: { from: -18 }, duration: 320, ease: "out(3)" })
        .add(".workspace-header h1", { opacity: { from: 0 }, y: { from: 16 }, duration: 430, ease: "out(4)" }, "-=180")
        .add(".workspace-header p, .workspace-header .metric-chip", { opacity: { from: 0 }, y: { from: 9 }, delay: stagger(55), duration: 360, ease: "out(3)" }, "-=250");
    });
    return () => scope.revert();
  }, [activeSection, initializing, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || !activeTunnelCount || !appRoot.current) return undefined;
    const scope = createScope({ root: appRoot }).add(() => {
      createTimeline()
        .add(".approved-dock-icon", { scale: [{ to: 1.28, duration: 180 }, { to: 1, duration: 420 }], rotate: { from: "-.08turn", to: "0turn" }, ease: "out(3)" })
        .add(".connection-sparks i", { opacity: [{ from: 0, to: 1, duration: 120 }, { to: 0, duration: 380 }], y: { from: 4, to: -18 }, scale: { from: .4, to: 1.5 }, delay: stagger(75), ease: "out(4)" }, "-=330");
    });
    return () => scope.revert();
  }, [activeTunnelCount, activeSection, reducedMotion]);

  function addEvent(action, detail, status = "info") {
    const event = { id: `${Date.now()}-${action}`, time: new Date().toLocaleString(localeTags[locale], { hour12: false }), action, detail, status };
    setEvents((items) => [event, ...items.filter((item) => item.id !== event.id)].slice(0, 200));
    if (isTauri()) invoke("append_activity_event", { event }).catch(() => {});
  }

  function friendlyAwsError(error) {
    const message = String(error || "").trim();
    if (/token has expired|refresh failed|sso/i.test(message)) return "This profile's SSO session has expired. Reconnect it and try again.";
    return message || "AWS CLI did not return failure details.";
  }

  function updateProfiles(items) {
    setProfiles(items);
    setSelectedProfile((current) => items.find((item) => item.name === current?.name) || items[0] || null);
  }

  function toggleAccount(accountKey) {
    setCollapsedAccounts((current) => {
      const next = new Set(current);
      if (next.has(accountKey)) next.delete(accountKey);
      else next.add(accountKey);
      return next;
    });
  }

  function openAccount(group) {
    setSelectedAccountKey(group.key);
    setSelectedProfile((current) => group.profiles.some((profile) => profile.name === current?.name) ? current : group.profiles[0] || null);
    setProfileDetailMode("account");
    setActiveSection("profiles");
  }

  function openProfile(profile) {
    setSelectedProfile(profile);
    setSelectedAccountKey(profile.accountId || "unidentified");
    setProfileDetailMode("profile");
    setActiveSection("profiles");
  }

  async function loadInitialState() {
    if (!isTauri()) {
      setLoading(false);
      setInitializing(false);
      setNotice("Open the desktop app to inspect profiles configured on this machine.");
      return;
    }
    setLoadingMessage(initializing ? "Preparing local environment" : "Refreshing local diagnostics");
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        invoke("system_status"),
        invoke("runner_status", { runner: runnerPayload(runner) }),
        invoke("discover_profiles"),
        invoke("list_approved_destinations"),
        invoke("suggest_local_port", { runner: runnerPayload(runner) }),
        invoke("list_activity_events"),
      ]);
      const value = (index, fallback) => results[index].status === "fulfilled" ? results[index].value : fallback;
      const system = value(0, { platform: "unknown", environment: "unknown", architecture: "unknown", wsl: [] });
      const executorStatus = value(1, { awsCli: false, sessionManagerPlugin: false });
      const configured = value(2, []);
      const approved = value(3, []);
      const suggested = value(4, { port: 15432, message: "Initial port reserved for validation." });
      const persistedEvents = value(5, []);
      setRuntime({ ...system, ...executorStatus });
      setPluginPromptOpen(false);
      updateProfiles(configured);
      setApprovedDestinations(approved);
      setSelectedDestination(approved[0] || null);
      setPort(suggested.port);
      setPortReady(results[4].status === "fulfilled");
      setEvents(persistedEvents);
      lastAccountCheckAt.current = Date.now();
      setNotice(configured.length ? "Checkup complete. Configured profiles were loaded." : "Checkup complete with items that require setup.");
      addEvent("Environment checkup", `${configured.length} configured profile(s)`, executorStatus.awsCli && executorStatus.sessionManagerPlugin ? "success" : "info");
    } catch (error) {
      setNotice(`Unable to load the environment: ${String(error)}`);
      addEvent("Failed to load environment", String(error), "error");
    } finally {
      setLoading(false);
      setInitializing(false);
    }
  }

  async function refresh(options = {}) {
    const background = options?.background === true;
    if (!isTauri()) {
      if (!background) setNotice("Open the desktop app to check AWS sessions.");
      return;
    }
    if (accountCheckInFlight.current) return;
    accountCheckInFlight.current = true;
    if (!background) {
      setLoadingMessage("Checking AWS profiles and sessions");
      setLoading(true);
    }
    try {
      const [system, executorStatus, discovered, approved] = await Promise.all([invoke("system_status"), invoke("runner_status", { runner: runnerPayload(runner) }), invoke("discover_profiles"), invoke("list_approved_destinations")]);
      setRuntime({ ...system, ...executorStatus });
      updateProfiles(discovered);
      setApprovedDestinations(approved);
      setSelectedDestination((current) => approved.find((item) => item.id === current?.id) || approved[0] || null);
      if (!background) {
        setNotice("AWS sessions checked. No tunnel was opened.");
        addEvent("Sessions checked", `${discovered.filter((item) => item.status === "connected").length} connected profile(s)`, "success");
      }
    } catch (error) {
      if (!background) {
        setNotice(`Unable to check the environment: ${String(error)}`);
        addEvent("Failed to check sessions", String(error), "error");
      }
    } finally {
      lastAccountCheckAt.current = Date.now();
      accountCheckInFlight.current = false;
      if (!background) setLoading(false);
    }
  }

  async function chooseRunner(value) {
    setRunner(value);
    if (!isTauri()) return;
    setRunnerLoading(true);
    try {
      const [suggested, executorStatus] = await Promise.all([
        invoke("suggest_local_port", { runner: runnerPayload(value) }),
        invoke("runner_status", { runner: runnerPayload(value) }),
      ]);
      setPort(suggested.port);
      setPortReady(true);
      setRuntime((current) => ({ ...current, ...executorStatus }));
      setPluginPromptOpen(false);
      setNotice(suggested.message);
    } catch (error) { setPortReady(false); setNotice(String(error)); }
    finally { setRunnerLoading(false); }
  }

  async function resetApplication() {
    if (!isTauri()) return;
    setResetting(true);
    try {
      await invoke("reset_local_state");
      setApprovedDestinations([]);
      setSelectedDestination(null);
      setEvents([]);
      setActiveTunnels({});
      setApproval({ resourceId: "", targetId: "", remotePort: 22 });
      setDiscovery({ rdsEndpoints: [], ssmTargets: [] });
      setResetOpen(false);
      setCheckupOpen(true);
      setActiveSection("tunnels");
      setNotice("Local data removed. The application returned to its initial state.");
    } catch (error) {
      setNotice(`Unable to clear local data: ${String(error)}`);
    } finally {
      setResetting(false);
    }
  }

  async function installSessionManagerPlugin() {
    if (!isTauri()) return;
    setInstallingPlugin(true);
    try {
      const result = await invoke("install_session_manager_plugin", { runner: runnerPayload(runner) });
      setNotice(result.message);
      if (result.installed) {
        const [system, executorStatus] = await Promise.all([invoke("system_status"), invoke("runner_status", { runner: runnerPayload(runner) })]);
        setRuntime({ ...system, ...executorStatus });
        setPluginPromptOpen(false);
        addEvent("Dependency installed", "AWS Session Manager Plugin", "success");
      }
    } catch (error) {
      setNotice(`Unable to install Session Manager Plugin: ${String(error)}`);
      addEvent("Installation failed", String(error), "error");
    } finally {
      setInstallingPlugin(false);
    }
  }

  async function saveApproval(event) {
    event.preventDefault();
    if (!selectedProfile || !selectedResource || !selectedTarget) {
      setApprovalOpen(false);
      setNotice("Select a discovered profile, AWS resource, and SSM target before approving the destination.");
      return;
    }
    if (!isTauri()) {
      setApprovalOpen(false);
      setNotice("The preview does not save settings. Open the desktop app to approve a destination locally.");
      return;
    }
    setApprovalSaving(true);
    try {
      const approved = await invoke("approve_destination", { input: {
        label: `${selectedResource.label} · ${approval.remotePort}`.slice(0, 80),
        endpoint: selectedResource.host,
        dbPort: Number(approval.remotePort),
        endpointRole: selectedResource.endpointRole || "service",
        ssmTarget: selectedTarget.id,
        resourceType: selectedResource.resourceType,
        connectionMode: selectedResource.connectionMode,
        profile: selectedProfile.name,
        region: selectedProfile.region,
      } });
      setApprovedDestinations((items) => [...items.filter((item) => item.id !== approved.id), approved]);
      setSelectedDestination(approved);
      setApprovalOpen(false);
      setNotice(`Destination approved locally: ${approved.label}.`);
      addEvent("Approved destination", approved.label, "success");
    } catch (error) { setNotice(`Unable to approve the destination: ${String(error)}`); }
    finally { setApprovalSaving(false); }
  }

  async function removeApproval(id) {
    if (!isTauri()) return;
    setRemovingApproval(true);
    try {
      const entry = activeTunnels[id];
      if (entry) {
        await invoke("stop_tunnel", { id: entry.tunnelId });
        setActiveTunnels((current) => { const next = { ...current }; delete next[id]; return next; });
      }
      await invoke("remove_approved_destination", { id });
      const remaining = approvedDestinations.filter((item) => item.id !== id);
      setApprovedDestinations(remaining);
      setSelectedDestination((current) => current?.id === id ? remaining[0] || null : current);
      setNotice("Destination removed from local approval.");
      addEvent("Destination removed", id, "info");
    } catch (error) { setNotice(String(error)); }
    finally { setRemovingApproval(false); }
  }

  async function toggleTunnel() {
    if (!selectedDestination) {
      openApproval();
      setNotice("First approve an AWS resource and SSM target locally.");
      return;
    }
    if (activeEntry) {
      setTunnelBusy("Closing SSM tunnel");
      try {
        if (isTauri()) await invoke("stop_tunnel", { id: activeEntry.tunnelId });
        setActiveTunnels((current) => { const next = { ...current }; delete next[selectedDestination.id]; return next; });
        setNotice("Tunnel closed. No remote connection was changed.");
        addEvent("Tunnel closed", selectedDestination.label, "info");
      } catch (error) { setNotice(`Unable to close the tunnel: ${String(error)}`); }
      finally { setTunnelBusy(""); }
      return;
    }
    if (!isTauri()) {
      setNotice("Open the desktop app to start an SSM tunnel.");
      return;
    }
    if (pluginMissing) {
      setActiveSection("settings");
      setNotice("Session Manager Plugin must be installed on this computer before opening the tunnel.");
      addEvent("Tunnel blocked", "Session Manager Plugin not found", "error");
      return;
    }
    setTunnelBusy("Opening SSM tunnel");
    try {
      const active = await invoke("start_tunnel", { request: {
        profile: selectedDestination.profile,
        region: selectedDestination.region,
        target: selectedDestination.ssmTarget,
        host: selectedDestination.endpoint,
        remotePort: selectedDestination.dbPort,
        connectionMode: selectedDestination.connectionMode || "remote_host",
        runner: runnerPayload(runner),
      } });
      setActiveTunnels((current) => ({ ...current, [selectedDestination.id]: { tunnelId: active.id, localPort: active.localPort } }));
      setNotice(`Tunnel opened at ${active.localHost}:${active.localPort}.`);
      addEvent("Tunnel opened", `${selectedDestination.label} · localhost:${active.localPort}`, "success");
    } catch (error) { setNotice(`Unable to open the tunnel: ${String(error)}`); }
    finally { setTunnelBusy(""); }
  }

  useEffect(() => { loadInitialState(); }, []);

  useEffect(() => {
    if (initializing || !isTauri()) return undefined;

    const runAutomaticCheck = () => {
      if (document.visibilityState !== "visible" || activeLoadingMessage) return;
      if (accountCheckIsDue(lastAccountCheckAt.current)) refresh({ background: true });
    };

    const interval = window.setInterval(runAutomaticCheck, ACCOUNT_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", runAutomaticCheck);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", runAutomaticCheck);
    };
  }, [activeLoadingMessage, initializing, runner]);

  async function openApproval() {
    if (!selectedProfile) {
      setNotice("Select an AWS profile before approving a destination.");
      return;
    }
    setApprovalOpen(true);
    await discoverOptions(selectedProfile);
  }

  async function discoverOptions(profile = selectedProfile) {
    if (!profile) return;
    setDiscoveryLoading(true);
    setDiscoveryError("");
    setDiscovery({ rdsEndpoints: [], ssmTargets: [] });
    setApproval({ resourceId: "", targetId: "", remotePort: 22 });
    try {
      const options = await invoke("discover_tunnel_options", { profile: profile.name, region: profile.region });
      setDiscovery(options);
      const rds = options.rdsEndpoints.find((item) => item.endpointRole === "reader") || options.rdsEndpoints[0] || null;
      const firstNode = options.ssmTargets[0] || null;
      const resource = rds || firstNode;
      const target = rds ? options.ssmTargets.find((item) => !rds.vpcId || item.vpcId === rds.vpcId) : firstNode;
      setApproval({ resourceId: resource?.id || "", targetId: target?.id || "", remotePort: rds?.dbPort || firstNode?.defaultPort || 22 });
      addEvent("Resources discovered", `${options.rdsEndpoints.length} RDS endpoint(s) · ${options.ssmTargets.length} managed node(s)`, "success");
    } catch (error) {
      const message = friendlyAwsError(error);
      setDiscoveryError(message);
      addEvent("Discovery failed", `${profile.name} · ${message}`, "error");
    } finally {
      setDiscoveryLoading(false);
    }
  }

  async function startSsoLogin(profile = selectedProfile) {
    if (!profile || profile.auth !== "SSO" || !isTauri()) return;
    setLoginProfile(profile.name);
    try {
      await invoke("start_sso_login", { profile: profile.name, runner: runnerPayload(runner) });
      setNotice(`SSO login started for ${profile.name}. Complete it in the browser and check again.`);
      setDiscoveryError("Complete authentication in the browser and select “Try again”.");
      addEvent("SSO login started", profile.name, "info");
    } catch (error) {
      const message = friendlyAwsError(error);
      setNotice(`Unable to start SSO login: ${message}`);
      setDiscoveryError(message);
      addEvent("Failed to start SSO", `${profile.name} · ${message}`, "error");
    } finally {
      setLoginProfile("");
    }
  }

  function chooseResource(resourceId) {
    const resource = discoveredResources.find((item) => item.id === resourceId);
    const target = resource?.connectionMode === "managed_node"
      ? discovery.ssmTargets.find((item) => item.id === resource.id)
      : discovery.ssmTargets.find((item) => !resource?.vpcId || item.vpcId === resource.vpcId);
    setApproval({ resourceId, targetId: target?.id || "", remotePort: resource?.remotePort || 22 });
  }

  function openDestination(destinationToOpen) {
    setSelectedDestination(destinationToOpen);
    setActiveSection("tunnels");
  }

  return localizeNode(<MotionConfig reducedMotion="user"><main ref={appRoot} className="app-shell">
    <aside className="sidebar">
      <div className="brand-block"><div className="brand-mark"><Cloud size={35} weight="duotone" /></div><div><strong>AWS TUNNEL</strong><span>DESK</span></div></div>
      <LanguagePicker locale={locale} onChange={setLocale} />
      {isWindows && <div className="profile-summary"><small>RUNNER</small><div className="runner-select"><select value={runner} onChange={(event) => chooseRunner(event.target.value)} aria-label="AWS CLI runner"><option value="native">Native Windows</option>{runtime.wsl?.map((item) => <option key={item.name} value={item.name}>{item.name} · WSL{item.version}</option>)}</select><CaretDown size={16} /></div><span className="valid-until"><StatusDot status="unknown" /> {loading ? "Validating local port" : "Local port suggested"}</span></div>}
      <nav className={`side-nav ${isWindows ? "" : "native-only"}`} aria-label="Main navigation"><SidebarItem icon={PlugsConnected} active={activeSection === "tunnels"} onClick={() => setActiveSection("tunnels")}>Tunnels</SidebarItem><SidebarItem icon={SquaresFour} active={activeSection === "destinations"} onClick={() => setActiveSection("destinations")}>Destinations</SidebarItem><SidebarItem icon={ClipboardText} active={activeSection === "history"} onClick={() => setActiveSection("history")}>History</SidebarItem><SidebarItem icon={UsersThree} active={activeSection === "profiles"} onClick={() => setActiveSection("profiles")}>SSO profiles</SidebarItem><SidebarItem icon={GearSix} active={activeSection === "settings"} onClick={() => setActiveSection("settings")}>Settings</SidebarItem></nav>
      <div className="side-footer"><div><StatusDot status={runtime.awsCli ? "unknown" : "unavailable"} /> {runtime.awsCli ? "AWS CLI available" : "AWS CLI not found"}</div><button className="icon-button refresh-button" onClick={refresh} aria-label={loading ? "Checking environment" : "Check environment"} aria-busy={loading} disabled={loading}><ArrowsClockwise className={loading ? "refresh-icon spinning" : "refresh-icon"} size={18} /></button></div>
    </aside>

    <section className="profiles-panel">
      <div className="panel-heading"><span>AWS PROFILES</span><button className="icon-button refresh-button" onClick={refresh} aria-label={loading ? "Refreshing profiles" : "Refresh profiles"} aria-busy={loading} disabled={loading}><ArrowsClockwise className={loading ? "refresh-icon spinning" : "refresh-icon"} size={18} /></button></div>
      <label className="search-field"><ListMagnifyingGlass size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter profiles..." /></label>
      <div className="profile-list">{profileGroups.map((group) => { const collapsed = collapsedAccounts.has(group.key) && !search.trim(); const accountSelected = activeSection === "profiles" && selectedAccount?.key === group.key; return <section className={`account-group ${accountSelected ? "selected" : ""}`} key={group.key}><div className={`account-group-header ${accountSelected ? "selected" : ""}`}><button type="button" className="account-group-select" onClick={() => openAccount(group)}><StatusDot status={accountStatus(group.profiles)} /><span><strong>{group.accountId ? `AWS account ${group.accountId}` : "Account not identified yet"}</strong><small>{group.profiles.length} profile(s) · {group.profiles.filter((profile) => profile.status === "connected").length} connected</small></span></button><button type="button" className="account-group-toggle" onClick={() => toggleAccount(group.key)} aria-label={collapsed ? "Expand account" : "Collapse account"} aria-expanded={!collapsed}><CaretDown size={15} className={collapsed ? "account-caret collapsed" : "account-caret"} /></button></div>{!collapsed && <div className="account-profiles">{group.profiles.map((profile) => <button key={profile.name} onClick={() => openProfile(profile)} className={`profile-row ${activeSection === "profiles" && profileDetailMode === "profile" && selectedProfile?.name === profile.name ? "selected" : ""}`}><StatusDot status={profile.status} /><span><strong>{profile.name}</strong><small>{profile.auth} · {profile.region}</small></span><ArrowSquareOut size={15} className="profile-caret" /></button>)}</div>}</section>; })}{!loading && !visibleProfiles.length && <div className="empty-panel">{profiles.length ? "No profile matches the filter." : "No profile configured."}</div>}</div>
      <motion.button className="approved-dock" onClick={() => setActiveSection("destinations")} whileHover={{ x: 3, scale: 1.01 }} whileTap={{ scale: .97 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}><span className="approved-dock-icon"><ShieldCheck size={18} weight="duotone" /></span><span><strong>Approved destinations</strong><small>{`${approvedDestinations.length} total · ${activeTunnelCount} connected`}</small></span><CaretDown size={15} /></motion.button>
      <button className="new-tunnel" onClick={openApproval} disabled={!selectedProfile || discoveryLoading}><LoadingLabel active={discoveryLoading} loadingText="Discovering resources"><PlugsConnected size={18} /> Approve resource</LoadingLabel></button>
    </section>

    <section className="workspace">
      {activeSection === "tunnels" && <><header className="workspace-header"><div className="eyebrow"><span>→</span> {tunnelState === "active" ? "Active tunnel" : selectedDestination ? "Approved destination" : "New tunnel"}</div><div className="header-line"><div className="header-copy"><h1 title={destination?.label}>{destinationTitle} {selectedDestination && <span className={`state-pill ${tunnelState}`}>{tunnelState === "active" ? "ACTIVE" : "STOPPED"}</span>}</h1><p>{destination?.resourceType === "rds" ? <Database size={16} weight="fill" /> : <DesktopTower size={16} weight="fill" />} {destination ? `${destinationType} · port ${destination.dbPort} · ${destination.region} · via SSM Session Manager` : "Select a profile and approve an AWS resource."}</p></div><div className="elapsed"><small>{tunnelState === "active" ? "Local tunnel" : "Suggested port"}</small><strong>{tunnelState === "active" ? activeEntry.localPort : port}</strong></div><button className={`stop-button ${tunnelState} ${pluginMissing ? "attention" : ""}`} onClick={toggleTunnel} disabled={Boolean(tunnelBusy)}><LoadingLabel active={Boolean(tunnelBusy)} loadingText={tunnelState === "active" ? "Closing" : "Opening"}>{tunnelState === "active" ? <><StopCircle size={20} weight="fill" /> Stop tunnel</> : pluginMissing && selectedDestination ? <><WarningCircle size={20} weight="fill" /> Set up plugin</> : <><PlayCircle size={20} weight="fill" /> {selectedDestination ? "Open tunnel" : "Approve destination"}</>}</LoadingLabel></button></div></header><div className="content-scroll"><section className="connection-panel"><div className="section-title"><h2>Connection parameters</h2><ShieldCheck size={19} /><span>Safe values to copy</span></div><p className="muted">Use these values in a compatible client after opening the tunnel. They identify only the local connection and do not expose credentials.</p>{pluginMissing && <div className="dependency-warning"><WarningCircle size={22} weight="fill" /><div><strong>A local dependency is missing</strong><span>Install Session Manager Plugin to enable tunnels on this computer.</span></div><button className="secondary-action compact" onClick={() => setActiveSection("settings")}>View instructions</button></div>}<div className="connection-grid"><label>Local host<div className="copy-field"><span>{tunnelState === "active" ? "localhost" : "—"}</span><button disabled={tunnelState !== "active"} onClick={() => copyText("localhost")} aria-label="Copy host"><Copy size={20} /></button></div></label><label>Local port<div className="copy-field"><span>{tunnelState === "active" ? activeEntry.localPort : "—"}</span><button disabled={tunnelState !== "active"} onClick={() => copyText(String(activeEntry?.localPort))} aria-label="Copy port"><Copy size={20} /></button></div></label><label>Resource type<div className="select-field">{destination?.resourceType === "rds" ? <Database size={22} weight="duotone" /> : <DesktopTower size={22} weight="duotone" />}<span>{destinationType}</span></div></label><label>Approved destination<div className={`copy-field endpoint-display ${selectedDestination ? "" : "placeholder"}`}><span>{destination ? `${destination.endpoint}:${destination.dbPort}` : "Awaiting approval"}</span></div></label></div><div className="security-note"><ShieldCheck size={22} weight="duotone" /><span>The application neither reads nor reveals Secrets Manager values. Local approval does not replace IAM, network, operating system, or service permissions.</span></div></section><section className="activity-panel"><div className="section-title"><h2>Recent activity</h2><button className="plain-action" onClick={() => setActiveSection("history")}>View all <ArrowSquareOut size={16} /></button></div><div className="activity-list">{events.slice(0, 4).map((item) => <div className="activity-row" key={item.id}><time>{item.time}</time><StatusDot status={item.status === "success" ? "connected" : item.status === "error" ? "unavailable" : "info"} /><strong>{item.action}</strong><span>{item.detail}</span></div>)}{!events.length && <div className="empty-activity">No action was performed in this session.</div>}</div></section></div></>}

      {activeSection === "destinations" && <><header className="workspace-header section-page-header destinations-header"><div className="eyebrow"><span>→</span> Access library</div><div className="header-line"><div className="header-copy"><h1>Approved destinations</h1><p><SquaresFour size={16} /> Resources available for secure connection through Session Manager.</p></div><div className="metric-chip connected-metric"><strong>{activeTunnelCount}</strong><small>connected</small></div></div></header><div className="content-scroll destination-content"><DestinationLibrary destinations={approvedDestinations} activeTunnels={activeTunnels} profiles={profiles} viewMode={destinationView} onViewMode={setDestinationView} onOpen={openDestination} onApprove={openApproval} locale={locale} /></div></>}

      {activeSection === "history" && <><header className="workspace-header section-page-header"><div className="eyebrow"><span>→</span> Local audit</div><div className="header-line"><div><h1>Persistent history</h1><p><ClipboardText size={16} /> Events stored only on this computer, up to 200 records.</p></div><div className="metric-chip"><strong>{events.length}</strong><small>events</small></div></div></header><div className="content-scroll"><section className="connection-panel"><div className="section-title"><h2>Timeline</h2><span>Newest first</span></div><div className="activity-list full-history">{events.map((item) => <div className="activity-row" key={item.id}><time>{item.time}</time><StatusDot status={item.status === "success" ? "connected" : item.status === "error" ? "unavailable" : "info"} /><strong>{item.action}</strong><span>{item.detail}</span></div>)}{!events.length && <div className="empty-activity">There are no persistent events yet.</div>}</div></section></div></>}

      {activeSection === "profiles" && selectedAccount && <AccountProfileWorkspace account={selectedAccount} detailMode={profileDetailMode} selectedProfile={selectedProfile} destinations={approvedDestinations} hasActiveTunnels={activeTunnelCount > 0} loading={loading} loginProfile={loginProfile} locale={locale} onSelectProfile={openProfile} onRefresh={refresh} onLogin={startSsoLogin} onApprove={openApproval} onViewTunnel={() => setActiveSection("tunnels")} />}
      {activeSection === "profiles" && !selectedAccount && <><header className="workspace-header section-page-header"><div className="eyebrow"><span>→</span> AWS authentication</div><div className="header-line"><div className="header-copy"><h1>Configure AWS access</h1><p><UsersThree size={16} /> Add an AWS CLI profile, authenticate it, and then approve a resource.</p></div><button className="secondary-action" onClick={refresh} disabled={loading}><LoadingLabel active={loading} loadingText="Checking"><ArrowsClockwise size={18} /> Check sessions</LoadingLabel></button></div></header><div className="content-scroll"><section className="setup-path-card empty-account-setup"><div className="section-title"><h2>Start here</h2><span>Three steps</span></div><div className="setup-path"><article className="setup-step next"><span>1</span><div><small>PROFILE</small><strong>Configure AWS CLI</strong><p>Run `aws configure sso` in a terminal and return here.</p></div><TerminalWindow size={22} /></article><article className="setup-step"><span>2</span><div><small>AUTHENTICATION</small><strong>Connect the SSO session</strong><p>Use the profile action to open AWS authentication.</p></div><UsersThree size={22} /></article><article className="setup-step"><span>3</span><div><small>RESOURCE ACCESS</small><strong>Approve a resource</strong><p>Discover visible RDS, EC2, and managed nodes.</p></div><ShieldCheck size={22} /></article></div><div className="profile-command standalone"><span>Configure the first profile</span><code>aws configure sso</code><button type="button" onClick={() => copyText("aws configure sso")} aria-label="Copy AWS configure SSO command"><Copy size={16} /></button></div></section></div></>}

      {activeSection === "settings" && <><header className="workspace-header section-page-header"><div className="eyebrow"><span>→</span> Local environment</div><div className="header-line"><div className="header-copy"><h1>Settings</h1><p><GearSix size={16} /> Dependencies, runner, and data persisted on this computer.</p></div><button className="secondary-action" onClick={loadInitialState} disabled={loading}><LoadingLabel active={loading} loadingText="Refreshing"><ArrowsClockwise size={18} /> Refresh diagnostics</LoadingLabel></button></div></header><div className="content-scroll"><div className="settings-grid"><section className="settings-card"><small>PLATFORM</small><strong>{runtime.platform || "Detecting…"}</strong><span>{isWindows ? "Windows with native and WSL runner support." : "AWS CLI runs directly on the system."}</span></section><section className="settings-card"><small>AWS CLI</small><strong>{runtime.awsCli ? "Available" : "Not found"}</strong><span>Required for SSO, resource discovery, and SSM sessions.</span></section><section className={`settings-card ${pluginMissing ? "warning" : ""}`}><small>SESSION MANAGER</small><strong>{runtime.sessionManagerPlugin ? "Available" : "Not found"}</strong><span>{runtime.sessionManagerPlugin ? "Ready to start SSM sessions through AWS CLI." : "The check runs at startup. Installation proceeds only with consent and system authentication."}</span>{pluginMissing && <button className="secondary-action dependency-action" onClick={installSessionManagerPlugin} disabled={installingPlugin}><LoadingLabel active={installingPlugin} loadingText="Installing"><DownloadSimple size={17} /> Install component</LoadingLabel></button>}</section><section className="settings-card"><small>LOCAL PORT</small><strong>{port}</strong><span>Automatically selected in the 15432–15531 range.</span></section><section className="settings-card"><small>LOCAL HISTORY</small><strong>{events.length} event(s)</strong><span>Stored only on this computer, limited to the 200 most recent records.</span></section><section className="settings-card"><small>TUTORIAL</small><strong>Getting started</strong><span>Replay the short walkthrough of profiles, destinations, and tunnels.</span><button className="secondary-action" onClick={openTour}><Compass size={17} /> Show tutorial</button></section><section className="settings-card danger"><small>RESET ZONE</small><strong>Start over</strong><span>Closes tunnels and removes approved destinations and history. AWS CLI profiles are not changed.</span><button className="danger-action" onClick={() => setResetOpen(true)}><Trash size={17} /> Clear local data</button></section>{isWindows && <section className="settings-card wide"><small>WINDOWS RUNNER</small><div className="runner-select settings-runner"><select value={runner} onChange={(event) => chooseRunner(event.target.value)} disabled={runnerLoading}><option value="native">Native Windows</option>{runtime.wsl?.map((item) => <option key={item.name} value={item.name}>{item.name} · WSL{item.version}</option>)}</select><CaretDown size={16} /></div><span>{runnerLoading ? <><LoadingOrb size="small" /> Validating dependencies and an available port…</> : "CLI and Session Manager Plugin must exist in the selected runner."}</span></section>}</div></div></>}

      <footer className="workspace-footer"><span><ShieldCheck size={18} /> {notice}</span><button className="help-link" onClick={() => setNotice(isWindows ? "Install AWS CLI and session-manager-plugin in the selected runner. For WSL, install both inside the distribution." : "Install AWS CLI and session-manager-plugin on the system. The plugin is required only when opening tunnels.")}><WarningCircle size={18} /> Help</button></footer>
    </section>

    {tourOpen && !checkupOpen && !initializing && <OnboardingTour step={onboardingSteps[tourStep]} total={onboardingSteps.length} current={tourStep} locale={locale} onNext={() => setTourStep((step) => Math.min(step + 1, onboardingSteps.length - 1))} onBack={() => setTourStep((step) => Math.max(step - 1, 0))} onSkip={closeTour} onFinish={closeTour} />}

    {checkupOpen && !initializing && <div className="checkup-overlay" role="dialog" aria-modal="true" aria-label="Environment checkup"><section className="checkup-window">
      <header className="checkup-header"><div className="checkup-brand"><span><Cloud size={25} weight="duotone" /></span><div><small>ENVIRONMENT PRE-FLIGHT</small><strong>AWS Tunnel Desk</strong></div></div><div className="checkup-header-actions"><LanguagePicker locale={locale} onChange={setLocale} compact /><div className={`checkup-score ${checkupReady ? "ready" : "attention"}`}><span>{checkupCount}/3</span><small>{checkupReady ? "READY TO USE" : "ITEMS COMPLETE"}</small></div></div></header>
      <div className="checkup-body"><aside className="checkup-intro"><div className="environment-mark"><DesktopTower size={30} weight="duotone" /></div><small>DETECTED ENVIRONMENT</small><h1>{guide.label}</h1><p>{guide.detail}</p>{isWindows && <label className="checkup-runner">Run AWS CLI in<div className="runner-select"><select value={runner} onChange={(event) => chooseRunner(event.target.value)} disabled={runnerLoading}><option value="native">Native Windows</option>{runtime.wsl?.map((item) => <option key={item.name} value={item.name}>{item.name} · WSL{item.version}</option>)}</select><CaretDown size={16} /></div></label>}<div className="checkup-note"><ShieldCheck size={18} /><span>Diagnostics are local. No AWS configuration or resource is changed.</span></div></aside>
        <div className="checkup-requirements"><div className="checkup-title"><div><small>RUNTIME CHECKLIST</small><h2>{checkupReady ? "Environment ready" : "Prepare this computer"}</h2></div>{runnerLoading && <LoadingOrb />}</div>
          <RequirementCard locale={locale} ready={runtime.awsCli} title="AWS CLI v2" description={runtime.awsCli ? "Executable found in the selected environment." : `Install AWS CLI v2 inside ${guide.label} and reopen the terminal before checking again.`} command={guide.awsCommand} />
          <RequirementCard locale={locale} ready={runtime.sessionManagerPlugin} title="Session Manager Plugin" description={runtime.sessionManagerPlugin ? "Component available to maintain SSM sessions." : `Install the component in the same environment as AWS CLI: ${guide.label}.`} action={<button type="button" className="requirement-action" onClick={installSessionManagerPlugin} disabled={installingPlugin}><LoadingLabel active={installingPlugin} loadingText="Preparing installation"><DownloadSimple size={17} /> Install with assistance</LoadingLabel></button>} />
          <RequirementCard locale={locale} ready={profiles.length > 0} title="AWS profile configured" description={profiles.length ? `${profiles.length} profile(s) found in AWS CLI.` : "Create an SSO profile. The browser will be used for authentication and no credentials will be stored by the app."} command="aws configure sso" />
          <div className="port-strategy"><div><span>AUTOMATIC LOCAL PORT</span><strong>{portReady ? `${port} suggested now` : "Selected when opening"}</strong></div><p>No setup required. The application starts at 15432, increments until it finds a free port, and validates again when opening the tunnel.</p></div>
        </div>
      </div>
      <footer className="checkup-footer"><div><TerminalWindow size={18} /><span>After installing anything, select <strong>Check again</strong>.</span></div><div className="checkup-actions"><button type="button" className="secondary-action" onClick={loadInitialState} disabled={loading || runnerLoading}><LoadingLabel active={loading} loadingText="Checking"><ArrowsClockwise size={17} /> Check again</LoadingLabel></button><button type="button" className={`checkup-continue ${checkupReady ? "ready" : "limited"}`} onClick={() => setCheckupOpen(false)}>{checkupReady ? "Enter application" : "Continue in limited mode"}</button></div></footer>
    </section></div>}

    {pluginPromptOpen && pluginMissing && <div className="approval-overlay" role="dialog" aria-modal="true" aria-label="Prepare Session Manager Plugin"><div className="approval-dialog compact-dialog"><div className="dialog-heading"><div><span>TUNNEL DEPENDENCY</span><h2>Prepare this computer</h2></div><button type="button" className="icon-button" onClick={() => setPluginPromptOpen(false)} aria-label="Not now" disabled={installingPlugin}><X size={20} /></button></div><p>AWS CLI is available, but the component that maintains SSM sessions was not found. The official package will be downloaded and the system will request authorization before installing.</p><div className="dialog-note"><ShieldCheck size={20} /> The application collects no AWS credentials or administrator password.</div><div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setPluginPromptOpen(false)} disabled={installingPlugin}>Not now</button><button type="button" className="approve-button" onClick={installSessionManagerPlugin} disabled={installingPlugin}><LoadingLabel active={installingPlugin} loadingText="Preparing"><DownloadSimple size={19} /> Install component</LoadingLabel></button></div></div></div>}

    {resetOpen && <div className="approval-overlay" role="dialog" aria-modal="true" aria-label="Clear local data"><div className="approval-dialog compact-dialog danger-dialog"><div className="dialog-heading"><div><span>CONFIRMATION REQUIRED</span><h2>Start over?</h2></div><button type="button" className="icon-button" onClick={() => setResetOpen(false)} aria-label="Cancel" disabled={resetting}><X size={20} /></button></div><p>This action closes active tunnels and removes approved destinations and all history stored by the application.</p><div className="dialog-note"><ShieldCheck size={20} /> Profiles, SSO sessions, AWS CLI credentials, and AWS resources will not be changed.</div><div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setResetOpen(false)} disabled={resetting}>Cancel</button><button type="button" className="danger-action solid" onClick={resetApplication} disabled={resetting}><LoadingLabel active={resetting} loadingText="Clearing"><Trash size={18} /> Clear local data</LoadingLabel></button></div></div></div>}

    {approvalOpen && selectedProfile && <div className="approval-overlay" role="dialog" aria-modal="true" aria-label="Approve destination"><form className="approval-dialog" onSubmit={saveApproval}><div className="dialog-heading"><div><span>LOCAL SETUP</span><h2>Approve resource</h2></div><button type="button" className="icon-button" onClick={() => setApprovalOpen(false)} aria-label="Close" disabled={discoveryLoading || approvalSaving}><X size={20} /></button></div><p>Choose a resource discovered by AWS CLI. Endpoints and identifiers cannot be entered manually.</p><div className="approval-context"><span>{selectedProfile.name}</span><span>{selectedProfile.region}</span></div>{discoveryLoading && <div className="discovery-state loading-state"><LoadingOrb /> <div><strong>Mapping available resources</strong><span>Querying RDS, EC2, and managed nodes visible to this profile…</span></div></div>}{discoveryError && <><div className="discovery-state error"><WarningCircle size={18} /> {discoveryError}</div><div className="recovery-actions">{selectedProfile.auth === "SSO" && <button type="button" className="secondary-action" onClick={() => startSsoLogin(selectedProfile)} disabled={Boolean(loginProfile)}><LoadingLabel active={loginProfile === selectedProfile.name} loadingText="Opening SSO">Reconnect SSO</LoadingLabel></button>}<button type="button" className="secondary-action" onClick={() => discoverOptions(selectedProfile)} disabled={discoveryLoading}><ArrowsClockwise size={17} /> Try again</button></div></>}{!discoveryLoading && !discoveryError && <><label>AWS resource<select required value={approval.resourceId} onChange={(event) => chooseResource(event.target.value)}><option value="" disabled>Select a discovered resource</option>{discovery.rdsEndpoints.length > 0 && <optgroup label="RDS">{discovery.rdsEndpoints.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.endpoint}:{item.dbPort}</option>)}</optgroup>}{discovery.ssmTargets.some((item) => item.resourceType === "ec2") && <optgroup label="EC2">{discovery.ssmTargets.filter((item) => item.resourceType === "ec2").map((item) => <option key={item.id} value={item.id}>{item.label} · {item.platformName}</option>)}</optgroup>}{discovery.ssmTargets.some((item) => item.resourceType !== "ec2") && <optgroup label="Managed nodes">{discovery.ssmTargets.filter((item) => item.resourceType !== "ec2").map((item) => <option key={item.id} value={item.id}>{item.label} · {item.platformName}</option>)}</optgroup>}</select></label><div className="approval-grid"><label>Remote port<input type="number" min="1" max="65535" required value={approval.remotePort} onChange={(event) => setApproval({ ...approval, remotePort: event.target.value })} disabled={selectedResource?.resourceType === "rds"} /></label><label>Mode<div className="discovered-value">{selectedResource?.connectionMode === "managed_node" ? "Direct to node" : "Remote host"}</div></label></div>{selectedResource?.connectionMode === "remote_host" ? <label>SSM access node<select required value={approval.targetId} onChange={(event) => setApproval({ ...approval, targetId: event.target.value })} disabled={!compatibleTargets.length}><option value="" disabled>Select a compatible SSM node</option>{compatibleTargets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : selectedResource && <label>SSM node<div className="discovered-value">{selectedTarget?.label || "—"}</div></label>}{!discoveredResources.length && <div className="discovery-state">No RDS, EC2, or online managed node was found for this profile and region.</div>}{selectedResource?.connectionMode === "remote_host" && !compatibleTargets.length && <div className="discovery-state">No online SSM node compatible with this resource's network was found.</div>}</>}<div className="dialog-actions">{selectedDestination && approvedDestinations.some((item) => item.id === selectedDestination.id) && <button className="remove-button" type="button" onClick={() => { removeApproval(selectedDestination.id); setApprovalOpen(false); }} disabled={removingApproval || approvalSaving}>Remove current</button>}<button className="approve-button" type="submit" disabled={discoveryLoading || approvalSaving || !selectedResource || !selectedTarget || Number(approval.remotePort) < 1 || Number(approval.remotePort) > 65535}><LoadingLabel active={approvalSaving} loadingText="Saving"><ShieldCheck size={19} /> Approve locally</LoadingLabel></button></div></form></div>}

    {!initializing && activeLoadingMessage && <div className="operation-indicator" role="status" aria-live="polite"><LoadingOrb /><div><small>OPERATION IN PROGRESS</small><strong>{activeLoadingMessage}</strong></div></div>}
    {initializing && <div className="startup-loader" role="status" aria-live="polite"><div className="startup-loader-card"><div className="loader-emblem"><Cloud size={30} weight="duotone" /><LoadingOrb size="large" /></div><small>AWS TUNNEL DESK</small><h2>Preparing your environment</h2><p>Validating AWS CLI, runner, local port, and persistent data.</p><div className="loading-track"><span /></div></div></div>}
  </main></MotionConfig>, locale);
}
