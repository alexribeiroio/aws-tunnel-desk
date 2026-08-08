# Design QA — AWS Tunnel Desk

This document records the reusable design acceptance criteria. It intentionally excludes local screenshots, temporary paths, private AWS identifiers, and machine-specific evidence.

## Baseline

- Desktop layout with fixed application chrome and independently scrollable data regions.
- Clear status text accompanies every status color.
- Connection parameters distinguish local values from remote AWS destinations.
- Approved destinations remain prominent and can be displayed as a list or as cards.
- Loading feedback is visible for discovery, authentication, validation, installation, persistence, and tunnel lifecycle operations.
- Reduced-motion preferences disable non-essential animation.

## Interaction acceptance criteria

- Starting and stopping a tunnel updates the process state and visible controls.
- Closing a tunnel terminates the managed Session Manager process and verifies that the local listener is no longer owned by the application.
- Profile filtering and account collapsing work with keyboard and pointer input.
- Destination approval accepts only resources discovered by the selected AWS profile.
- The environment pre-flight explains missing dependencies for the active operating system and runner.
- Persistent history survives an application restart and can be cleared from Settings.

## Visual acceptance criteria

- Navigation, profile groups, approved destinations, and the active workspace maintain a clear hierarchy.
- Forms do not overflow or expand the desktop grid.
- Focus indicators remain visible against the dark theme.
- Empty, loading, connected, disconnected, authentication-required, warning, and error states are visually distinct.
- Screenshots used in pull requests contain synthetic profiles, resources, account IDs, endpoints, and activity.

## Release validation

Before a stable release, maintainers should exercise:

- Windows with the native AWS CLI;
- Windows with WSL1;
- Windows with WSL2;
- macOS on Apple Silicon and Intel or the universal package;
- Debian or Ubuntu using the DEB package;
- an RPM-based distribution;
- the AppImage on a compatible distribution.

Record platform-specific limitations in the release notes instead of inferring support from a successful compilation.
