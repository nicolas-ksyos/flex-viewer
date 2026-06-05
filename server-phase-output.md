# Server Phase Output

## Files Created / Modified

| File | Action |
|---|---|
| `src/server/seedWriter.ts` | **Modified** — whole-object regeneration replaces per-property patching |
| `src/server/migrationConverter.ts` | **Created** — seed→migration text transform |
| `src/server/routes/migrationRoutes.ts` | **Created** — `POST /api/migrations/convert` route |
| `src/server/index.ts` | **Modified** — registers `migrationRoutes` |
| `src/shared/types.ts` | **Modified** — added `MigrationConvertRequest` and `MigrationConvertResponse` |

---

## TypeScript Check

```
src/client/components/WorkflowView.tsx(5,31): error TS2307: Cannot find module '@frontend/...'
src/server/fileWatcher.ts(8,14): error TS2503: Cannot find namespace 'chokidar'.
src/server/fileWatcher.ts(45,23): error TS7006: Parameter 'err' implicitly has an 'any' type.
```

**All 3 errors are pre-existing** (verified by stashing changes and re-running tsc). No new TypeScript errors introduced by this work.

---

## Validation

### seedWriter (whole-object regeneration)
Smoke test on a copy of the real orthoptics seed:
- ✅ New `x: 99`, `y: 88` written correctly
- ✅ `block: BlockName.fixedIntervalScheduler` preserved verbatim
- ✅ `name` preserved
- ✅ `block` appears before `name` (canonical order respected)

### migrationConverter (13/13 checks passed)
Tested against `124_1_orthoptics_service.ts`:
- ✅ `export async function seed(…)` → `export async function up(knex: Knex) {`
- ✅ `export async function down()` appended
- ✅ `await deleteSeedData(knex);` inserted as first statement of `up()`
- ✅ `async function deleteSeedData(knex: Knex)` helper appended at end
- ✅ `isActive: !['production', 'preproduction'].includes(Config.instance.get('NODE_ENV'))` added to `createService()`
- ✅ `import { Config } from '@backend/utils/config'` added
- ✅ `cleanServiceGroup` import and call both removed
- ✅ `// 0. Add specialism` section (including knex insert + `generateIdAndTimestamps` line) removed
- ✅ `profileName: 'Huisarts'`, `profileName: 'Orthoptist'` (one-step pattern)
- ✅ All `profileCreationHelper.createProfile(…)` call lines removed
- ✅ `ServiceCode.Orthoptics` used in `deleteSeedData` helper body
- ✅ File name derived correctly (`0999-orthoptics-test.ts` from seed `124_1_orthoptics_service.ts`)

---

## Assumptions & Edge Cases

### seedWriter
1. **`block` always verbatim** — in seed files `block` is always a member expression (`BlockName.something`), never a string literal. Any `change.fields.block` value is silently ignored (same behaviour as the old patcher, which skipped non-literal initialisers). If the UI ever needs to change block type, the converter will need special handling to produce `BlockName.${value}`.
2. **Multi-line verbatim values** — `nextSteps`, `synchronousNextSteps`, `activities` with multi-line array content are copied verbatim using absolute source positions. This relies on the standard 8-space property indent used consistently across seed files.
3. **Extra properties** — any property not in `CANONICAL_ORDER` (uncommon) is appended after the canonical properties.

### migrationConverter
1. **Specialism regex** — matches `\n\n    // 0. Add specialism\n…\n    .ignore();\n`. If a seed does not have a specialism section (or uses a different comment), the transform is silently skipped (no error).
2. **`generateIdAndTimestamps` import** — removed only when no remaining usages are found after the specialism section is stripped. If the seed uses it for other things, the import is preserved.
3. **Profile `.name` references** — `xyzProfile.name` is replaced with `'ProfileName'` (literal). This covers the `serviceEmployments` section where profiles are referenced by name.
4. **`deleteSeedData` is a minimal stub** — deletes `serviceGroupMemberships` and `services` by `serviceCode`. Production-quality migrations (like Holter) have more comprehensive cleanup. The stub is intentionally minimal; developers are expected to extend it.
5. **Transitions call unchanged** — both seeds and migrations use `serviceCreationHelper.generateTransitions(…)` with identical syntax; no transform needed.
6. **`down()` placement** — uses `lastIndexOf('\n}')` to find the up() closing brace. This is safe as long as the up() function is the last top-level construct in the file at the time transform 8 runs (before `down()` and `deleteSeedData` are appended).

---

## Recommended Next Step

Client-side phase: implement `ContextSidebar`, block selection, `BlockDetailPanel`, `ConvertMigrationForm`, sidebar action header (Edit/Clone/Convert buttons), and remove the info icon from canvas blocks.
