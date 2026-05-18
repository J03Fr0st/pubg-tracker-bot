# Suggested commands

- Install dependencies: `npm install`
- Build: `npm run build`
- Development bot: `npm run dev`
- Development bot with console output: `npm run dev:console`
- Production start after build: `npm start`
- Register/update Discord slash commands: `npm run update-commands`
- Typecheck only: `npm run typecheck`
- Unit/integration Jest run: `npm test`
- Targeted Jest file or pattern: `npx jest <path-or-pattern> --runInBand`
- Integration tests: `npm run test:integration`
- Match-flow helper: `npm run test:match-flow`
- Formatting/import cleanup: `npm run format:imports`
- Full local check currently defined by package scripts: `npm run check:all`
- Docker compose run: `docker-compose up --build`
- Docker compose stop: `docker-compose down`

For Discord-channel changes, prefer targeted Jest suites plus `npm run typecheck`; full Jest can be slower than needed for focused service fixes.