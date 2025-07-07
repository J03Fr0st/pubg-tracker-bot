# Versioning and Release System

This project uses **automatic tag-based versioning** and Docker image publishing with semantic versioning (SemVer).

## Overview

The project implements an intelligent CI/CD pipeline that:
- **Automatically creates releases** when you commit to main (based on commit messages)
- **No version bump commits** - creates tags directly, eliminating sync requirements
- Builds and publishes Docker images with proper versioning
- Generates release notes automatically
- Provides manual release options when needed

## How It Works (The Magic!)

### **✅ Automatic Releases Without Sync Problems:**

```bash
git add .
git commit -m "feat: add new feature"    # Will trigger MINOR release
git push
# ✅ GitHub Actions automatically creates v1.3.0 tag
# ✅ No version bump commit pushed back to main
# ✅ No need to git pull - your branch stays clean!
# ✅ Release pipeline automatically triggered by the new tag
```

### **🎯 Smart Version Detection:**
The system automatically determines version bump type from your commit messages:

- **MAJOR** (`1.0.0` → `2.0.0`): `BREAKING CHANGE`, `breaking change`, or `feat!:`
- **MINOR** (`1.0.0` → `1.1.0`): `feat:`, `feature:`
- **PATCH** (`1.0.0` → `1.0.1`): Everything else (`fix:`, `docs:`, `chore:`, etc.)

### **🔄 The Full Process:**
1. **You commit** to main with any message
2. **Auto-tag job** analyzes your commit message
3. **Tag created** directly (e.g., v1.2.3) - no commits to main!
4. **Release job** triggered by the new tag
5. **Tests run** to ensure quality
6. **Package.json updated** in the release (not in main branch)
7. **GitHub release** created with changelog
8. **Docker images** built and published

## Workflows

### 1. Development Build (`dev-build.yml`)
- **Triggers**: Push to `main` branch
- **Purpose**: Creates development builds for testing
- **Docker Tags**: 
  - `your-username/pubg-tracker-bot:dev`
  - `your-username/pubg-tracker-bot:dev-{short-sha}`

### 2. Release (`release.yml`)
- **Triggers**: 
  - **Automatic**: Push to `main` branch (creates tags, then releases)
  - **Manual**: Workflow dispatch or direct tag push
- **Purpose**: Creates official releases with proper versioning
- **Actions**:
  - Auto-creates tags based on commit messages
  - Runs tests when tags are created
  - Updates package.json to match tag version
  - Generates changelog
  - Creates GitHub release
  - Builds and publishes Docker images

## Usage Examples

### **Automatic Releases (Primary Workflow)**

```bash
# These commits automatically trigger releases:

git commit -m "fix: resolve memory leak"           # → v1.2.4 (patch)
git commit -m "feat: add player statistics"       # → v1.3.0 (minor)
git commit -m "feat!: redesign API endpoints"     # → v2.0.0 (major)
git commit -m "docs: update README"               # → v1.2.5 (patch)

# Just push and releases happen automatically!
git push
```

### **Manual Releases (When Needed)**

#### **Via GitHub Actions UI:**
1. Go to Actions tab → Release workflow
2. Click "Run workflow"  
3. Choose version bump type
4. Click "Run"

#### **Via npm Scripts (Local Control):**
```bash
npm run release:patch    # 1.2.0 → 1.2.1
npm run release:minor    # 1.2.0 → 1.3.0  
npm run release:major    # 1.2.0 → 2.0.0
```

#### **Direct Tag Creation:**
```bash
git tag v1.2.3
git push origin v1.2.3
```

## Version Numbering

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** version: Incompatible API changes
- **MINOR** version: New functionality (backward compatible)
- **PATCH** version: Bug fixes (backward compatible)

## Commit Message Examples

### **Patch Releases (Bug Fixes)**
```bash
git commit -m "fix: resolve database connection issue"
git commit -m "chore: update dependencies"
git commit -m "docs: add API documentation"
git commit -m "style: fix linting issues"
```

### **Minor Releases (New Features)**
```bash
git commit -m "feat: add player search functionality"
git commit -m "feature: implement match history"
```

### **Major Releases (Breaking Changes)**
```bash
git commit -m "feat!: redesign user authentication"
git commit -m "BREAKING CHANGE: remove deprecated endpoints"
git commit -m "breaking change: update database schema"
```

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

## Benefits of This System

### ✅ **No Branch Sync Required**
- No version bump commits cluttering git history
- No need to `git pull` after commits
- Your local main branch stays in sync

### ✅ **Fully Automatic**
- Just commit and push like normal
- Releases happen based on your commit messages
- No manual steps required

### ✅ **Smart & Flexible**
- Automatic version detection from commit messages
- Manual override options available
- Duplicate tag protection

### ✅ **Clean Git History**
- Only your actual changes in commit history
- Version tags mark releases clearly
- No "chore: bump version" commits

## Setup Requirements

### GitHub Secrets

Make sure to set up these secrets in your GitHub repository:

```
DOCKERHUB_USERNAME=your-dockerhub-username
DOCKERHUB_TOKEN=your-dockerhub-access-token
```

## Troubleshooting

### No Release Created
- Check if your commit reached main branch
- Verify commit message follows expected patterns
- Look at Actions tab for any failed workflows

### Duplicate Tag Error
- The system automatically skips if tag already exists
- Check existing tags: `git tag -l`
- Use manual release for specific version numbers

### Release Failed
- Check if tests are passing
- Verify GitHub token permissions
- Look at Actions logs for specific errors

## Best Practices

1. **Use meaningful commit messages**: They determine your release type
2. **Follow conventional commits**: Helps with automatic versioning
3. **Test locally first**: Releases are automatic, so test before pushing
4. **Use feature branches**: For complex changes, use PRs to main
5. **Pin Docker versions in production**: Use specific version tags
6. **Monitor releases**: Check GitHub releases page regularly

## Migration Benefits  

If you were using the old auto-versioning system, you now get:

1. **✅ No more sync required**: Commit and push without pulling version bumps
2. **✅ Same automatic behavior**: Releases still happen on every commit
3. **✅ Cleaner git history**: No version bump commits
4. **✅ Better control**: Can still do manual releases when needed
5. **✅ Smarter versioning**: Commit messages determine version bump type 