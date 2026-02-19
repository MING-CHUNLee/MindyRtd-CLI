# Detailed Review Checklists

Full checklists for each step of the code-review skill.

## Step 2: Architecture Checklist

### Layer Compliance

- [ ] Code is in the correct directory for its responsibility?
- [ ] Commands only handle CLI interaction (parsing args, calling services)?
- [ ] Controllers only handle external API communication?
- [ ] Services contain reusable business logic (no direct I/O dependencies)?
- [ ] Views only handle output formatting (no business logic)?
- [ ] Types are properly defined and exported from `types/index.ts`?
- [ ] Config uses environment variables following 12-Factor App?
- [ ] Tests are in `tests/` directory with `.test.ts` suffix?

### Cross-Platform Compatibility

- [ ] Code handles Windows, macOS, and Linux paths correctly?
- [ ] Platform-specific paths use `process.platform` detection?
- [ ] `path.join()` used instead of hardcoded path separators?
- [ ] Executable names are platform-aware (e.g., `.exe` on Windows)?

## Step 4: Testing Checklist

- [ ] Tests exist for new functionality?
- [ ] Existing tests still pass? (`npm test` in `cli/`)
- [ ] Test coverage is adequate?
- [ ] Tests are cross-platform compatible? (use `toContain()`, not exact path matching)
- [ ] Mocks are properly set up for external dependencies (`fs`, `child_process`)?

## Step 5: Documentation Checklist

- [ ] Code is self-documenting?
- [ ] Public APIs are documented with JSDoc?
- [ ] `IMPLEMENTATION_PLAN.md` updated if needed?
- [ ] Directives updated if behavior changed?
