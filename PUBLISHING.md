# Publishing Flow

This document describes the automated publishing flow for the ng-form-cache library.

## Overview

The publishing process is split into two automated workflows:

1. **Release Workflow** (`release.yml`) - Triggered by tags, creates release PRs
2. **Publish Workflow** (`publish.yml`) - Triggered by release branches, builds and publishes

## Publishing Process

### 1. Create a Release Tag

Push a version tag to trigger the release process:

```bash
# For regular releases
git tag v1.0.0
git push origin v1.0.0

# For pre-releases
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1
```

### 2. Release Workflow Execution

When you push a tag with format `v*`, the **Release Workflow** automatically:

1. **Extracts version information** from the tag
   - Version: `v0.0.2-beta.1` → `0.0.2-beta.1`
   - Label: `0.0.2-beta.1` → `beta` (for pre-releases)
   - Pre-release flag: `true` if contains `-`, `false` otherwise

2. **Creates GitHub releases**
   - Regular release for versions without pre-release identifier
   - Pre-release for versions with pre-release identifier (alpha, beta, rc, etc.)

3. **Updates package versions and changelog**
   - Updates `package.json` and `projects/ng-form-cache/package.json`
   - Updates `projects/ng-form-cache/changelog.md`
   - Runs format checks

4. **Creates a release pull request**
   - Branch: `chore/release/v{version}`
   - Contains version bumps and changelog updates
   - Ready for review and merge

### 3. Publish Workflow Execution

When the release branch `chore/release/*` is pushed (by the Release Workflow), the **Publish Workflow** automatically:

1. **Extracts version from branch name**
   - Branch: `chore/release/v0.0.2-beta.1` → Version: `0.0.2-beta.1`

2. **Builds the library**
   - Runs `npm ci` to install dependencies
   - Verifies package.json versions match expected version
   - Runs format checks
   - Builds the library with `npm run build:library`

3. **Publishes to npm registry**
   - For regular releases: publishes with `latest` tag
   - For pre-releases: publishes with appropriate tag (`alpha`, `beta`, etc.)

## Version Tag Formats

### Regular Releases
```bash
v1.0.0
v1.2.3
```
- Published to npm with `latest` tag
- Creates GitHub Release (not pre-release)

### Pre-releases
```bash
v1.0.0-alpha.1
v1.0.0-beta.2
v1.0.0-rc.1
```
- Published to npm with distribution tag (`alpha`, `beta`, `rc`)
- Creates GitHub Pre-release

## Workflow Files

### `.github/workflows/release.yml`
- **Trigger**: Push tags matching `v*`
- **Purpose**: Create release PR with version updates
- **Jobs**:
  - `define-variables`: Extract version info from tag
  - `create-release`: Create GitHub release (for regular releases)
  - `create-prerelease`: Create GitHub pre-release (for pre-releases)
  - `create-release-pr`: Update versions and create PR

### `.github/workflows/publish.yml`
- **Trigger**: Push to branches matching `chore/release/*`
- **Purpose**: Build and publish the library
- **Jobs**:
  - `extract-version`: Extract version from branch name
  - `build-and-publish`: Build library and publish to npm

## Manual Steps

1. **Push the version tag** - This is the only manual step required
2. **Review and merge the release PR** - Created automatically by the Release Workflow
3. **Monitor the Publish Workflow** - Runs automatically when the release branch is pushed

## Package Configuration

The library is configured for GitHub Packages:
- Registry: `https://npm.pkg.github.com/`
- Package name: `@planbgmbh/ng-form-cache`
- Scope: `@planbgmbh`

## Pre-release Distribution Tags

Pre-releases are published with specific npm distribution tags:
- `alpha` versions → `@planbgmbh/ng-form-cache@alpha`
- `beta` versions → `@planbgmbh/ng-form-cache@beta`
- `rc` versions → `@planbgmbh/ng-form-cache@rc`

Users can install specific pre-release versions:
```bash
npm install @planbgmbh/ng-form-cache@beta
npm install @planbgmbh/ng-form-cache@0.0.2-beta.1
```

## Troubleshooting

### Version Mismatch
If the published version doesn't match the tag:
- Check the "Verify version in package.json" step in the Publish Workflow logs
- Ensure the Release Workflow completed successfully and updated package.json files

### Publishing Fails
- Check npm registry permissions and `NODE_AUTH_TOKEN`
- Verify the package builds successfully locally with `npm run build:library`
- Check for lint/format errors in the workflow logs