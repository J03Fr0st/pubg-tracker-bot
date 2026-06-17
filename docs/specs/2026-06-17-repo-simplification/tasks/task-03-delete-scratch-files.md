# Task 03: Delete Scratch Files

## Status

complete

## Wave

1

## Description

Delete tracked scratch files that are not part of the bot, tests, docs, or deployment surface. These files add noise to scans and diffs without contributing behavior.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None. This task is isolated to tracked scratch files.

## Files to Create

- None.

## Files to Modify

- `test-file.txt` - delete.
- `implement/plan.md` - delete.
- `implement/state.json` - delete.

## Technical Details

### Implementation Steps

1. Confirm the files are tracked:
   ```powershell
   git ls-files test-file.txt implement/plan.md implement/state.json
   ```
2. Delete only the listed files.
3. If the `implement` directory becomes empty, it does not need to remain.
4. Do not delete unrelated docs, plans, generated outputs, or local-only files.

### Code Snippets

No replacement code is expected.

### Environment Variables

No changes.

### API Endpoints

None.

## Verification Plan

### RED

- Command: `git ls-files test-file.txt implement/plan.md implement/state.json`
- Expected: Before implementation, the command lists the tracked scratch files.

### GREEN

- Command: `git ls-files test-file.txt implement/plan.md implement/state.json`
- Expected: After implementation and deletion, the command prints no tracked file paths.

### Final Verification

- Command: `git diff --check`
- Expected: Diff has no whitespace errors.

## Acceptance Criteria

- [ ] `test-file.txt` is deleted.
- [ ] `implement/plan.md` is deleted.
- [ ] `implement/state.json` is deleted.
- [ ] No unrelated files are removed.

## Notes

This task is intentionally small and should not be used as a reason to clean up unrelated stale docs.
