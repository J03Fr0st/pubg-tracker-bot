# CRUSH.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `npm run dev` - Start development server with auto-reload using nodemon
- `npm run build` - Compile TypeScript to JavaScript (outputs to `dist/`)
- `npm start` - Run the production build
- `npm run lint` - Run ESLint for code quality checks
- `npm run format` - Run Biome formatter
- `npm test` - Run unit tests with Jest
- `npm run test:integration` - Run integration tests
- `npm run test:watch` - Run tests in watch mode for development
- To run a single test file: `npm test -- <file_path>`

## Code Style

- **Formatting**: Use `npm run format` to apply Biome formatting. Key rules: 2-space indent, 100-char line width, single quotes, trailing commas, and always semicolons.
- **Linting**: Use `npm run lint` to check for code quality issues with ESLint.
- **Imports**: Imports are organized automatically by Biome.
- **Naming**: 
    - `PascalCase` for classes.
    - `camelCase` for variables and functions.
    - `kebab-case` for filenames.
- **Types**: Always declare types for variables, function parameters, and return values. Avoid `any`.
- **Error Handling**: Use exceptions for unexpected errors. Add context when catching exceptions.
- **Testing**:
    - Unit tests follow Arrange-Act-Assert.
    - Integration tests follow Given-When-Then.
    - Name test variables clearly (e.g., `input`, `mock`, `actual`, `expected`).
