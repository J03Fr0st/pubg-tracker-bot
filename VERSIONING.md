# Versioning and Release System

This project uses automated versioning and Docker image publishing with semantic versioning (SemVer).

## Overview

The project implements a comprehensive CI/CD pipeline that:
- Automatically bumps version numbers
- Creates git tags for releases
- Builds and publishes Docker images with proper versioning
- Generates release notes
- Provides both manual and automatic release triggers

## Workflows

### 1. Development Build (`dev-build.yml`)
- **Triggers**: Push to `main` branch
- **Purpose**: Creates development builds for testing
- **Docker Tags**: 
  - `your-username/pubg-tracker-bot:dev`
  - `your-username/pubg-tracker-bot:dev-{short-sha}`

### 2. Release (`release.yml`)
- **Triggers**: 
  - Manual dispatch with version type selection
  - Automatic on push to `main` (based on commit message)
- **Purpose**: Creates official releases with proper versioning
- **Actions**:
  - Runs tests
  - Bumps version in `package.json`
  - Creates git tag
  - Generates changelog
  - Creates GitHub release

### 3. Docker Publish (`docker-publish.yml`)
- **Triggers**: 
  - Push of version tags (`v*`)
  - Completion of Release workflow
- **Purpose**: Builds and publishes Docker images with semantic versioning
- **Docker Tags**:
  - `your-username/pubg-tracker-bot:v1.2.3` (exact version)
  - `your-username/pubg-tracker-bot:1.2.3` (without v prefix)
  - `your-username/pubg-tracker-bot:1.2` (major.minor)
  - `your-username/pubg-tracker-bot:1` (major only)
  - `your-username/pubg-tracker-bot:latest` (latest release)

## Usage

### Manual Release

1. **Via GitHub Actions**:
   - Go to Actions tab in GitHub
   - Select "Release" workflow
   - Click "Run workflow"
   - Choose version bump type: `patch`, `minor`, or `major`

2. **Via Command Line**:
   ```bash
   # Patch release (1.0.0 -> 1.0.1)
   npm run release:patch
   
   # Minor release (1.0.0 -> 1.1.0)
   npm run release:minor
   
   # Major release (1.0.0 -> 2.0.0)
   npm run release:major
   ```

### Automatic Release

Automatic releases are triggered by commit messages when pushing to `main`:

- **Major**: Commit contains `BREAKING CHANGE` or `breaking change`
- **Minor**: Commit starts with `feat` or `feature`
- **Patch**: All other commits

Examples:
```bash
git commit -m "feat: add new player tracking feature"     # Minor bump
git commit -m "fix: resolve memory leak issue"           # Patch bump
git commit -m "feat!: redesign API endpoints"            # Major bump
git commit -m "docs: update README"                      # Patch bump
```

## Version Numbering

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** version: Incompatible API changes
- **MINOR** version: New functionality (backward compatible)
- **PATCH** version: Bug fixes (backward compatible)

## Docker Image Usage

### Pull Specific Version
```bash
# Pull specific version
docker pull your-username/pubg-tracker-bot:v1.2.3

# Pull latest minor version
docker pull your-username/pubg-tracker-bot:1.2

# Pull latest major version
docker pull your-username/pubg-tracker-bot:1

# Pull latest release
docker pull your-username/pubg-tracker-bot:latest

# Pull development version
docker pull your-username/pubg-tracker-bot:dev
```

### Update docker-compose.yml
```yaml
services:
  pubg-tracker-bot:
    image: your-username/pubg-tracker-bot:v1.2.3  # Pin to specific version
    # or
    image: your-username/pubg-tracker-bot:1.2      # Auto-update patch versions
    # or
    image: your-username/pubg-tracker-bot:latest   # Always use latest release
```

## Setup Requirements

### GitHub Secrets

Make sure to set up these secrets in your GitHub repository:

```
DOCKERHUB_USERNAME=your-dockerhub-username
DOCKERHUB_TOKEN=your-dockerhub-access-token
```

### Docker Hub Access Token

1. Go to Docker Hub → Account Settings → Security
2. Create a new access token
3. Add it as `DOCKERHUB_TOKEN` secret in GitHub

## Multi-Platform Support

Docker images are built for multiple platforms:
- `linux/amd64` (Intel/AMD 64-bit)
- `linux/arm64` (ARM 64-bit, including Apple Silicon)

## Caching

The workflows use GitHub Actions cache to:
- Speed up Docker builds
- Reduce build times
- Save bandwidth

## Troubleshooting

### Release Failed
- Check if tests are passing
- Ensure Git is properly configured
- Verify GitHub token permissions

### Docker Push Failed
- Check Docker Hub credentials
- Verify repository permissions
- Check if image size is within limits

### Version Conflicts
- Ensure no uncommitted changes
- Pull latest changes before release
- Check if tag already exists

## Best Practices

1. **Always test before release**: Use development builds for testing
2. **Use meaningful commit messages**: They determine automatic version bumps
3. **Pin Docker versions in production**: Use specific version tags
4. **Monitor releases**: Check GitHub releases and Docker Hub for successful builds
5. **Update documentation**: Include version-specific changes in release notes 