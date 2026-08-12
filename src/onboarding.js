const STORAGE_KEY = "aws-tunnel-desk.onboarding-seen";

export const onboardingSteps = [
  {
    id: "welcome",
    icon: "Cloud",
    title: "Welcome to AWS Tunnel Desk",
    description: "Open secure SSM port-forwarding tunnels to RDS, EC2, and managed nodes without ever touching AWS credentials or secrets.",
  },
  {
    id: "profiles",
    icon: "UsersThree",
    title: "Connect your AWS CLI profiles",
    description: "The SSO profiles section lists profiles already configured with AWS CLI. Select one and connect its SSO session before discovering resources.",
  },
  {
    id: "destinations",
    icon: "ShieldCheck",
    title: "Approve a destination",
    description: "Use Approve resource to discover RDS endpoints, EC2 instances, and managed nodes visible to a connected profile. Endpoints can't be typed manually.",
  },
  {
    id: "tunnels",
    icon: "PlugsConnected",
    title: "Open the tunnel",
    description: "Open an approved destination from Tunnels to start an SSM Session Manager tunnel, then copy the local host and port into your client.",
  },
  {
    id: "history",
    icon: "ClipboardText",
    title: "Everything stays local",
    description: "Approved destinations and activity history are stored only on this computer. Revisit this tutorial anytime from Settings.",
  },
];

export function onboardingIsDue(storage = globalThis.localStorage) {
  return storage?.getItem(STORAGE_KEY) !== "1";
}

export function markOnboardingSeen(storage = globalThis.localStorage) {
  storage?.setItem(STORAGE_KEY, "1");
}
