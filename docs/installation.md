---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
4. Enable **Code components for canvas apps** if this control is used there.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

A Power Apps environment with code components enabled. Nothing else: the control
bundles no framework and depends on no platform library, so there is no React or
Fluent version to line up with, and it runs on any platform version that
supports code components.

**No consent prompt.** The manifest declares no `feature-usage` entries, so
importing it does not ask an administrator to approve access to the Web API, the
Utility API or a device. That is worth checking against here — if the import
does ask, the solution being imported is not this control.
