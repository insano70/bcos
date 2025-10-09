# Analytics Chart Refactor - Server-Side Optimization

## Objective
Refactor fetchChartData to use server-side data fetching and transformation, reducing network overhead by ~90% and cutting API calls in half.

## Current State
- ✅ Server-side route updated to fetch measures internally
- ✅ API schema accepts query parameters instead of measures array
- ✅ Calculated fields handled server-side
- ✅ TypeScript compilation passes on server-side
- ✅ Syntax error in client fixed (broken if block)
- ⚠️ Client still using old two-step flow (measures → chart-data)

## Architecture Change

### Before (Current - Inefficient)
```
Client → /api/measures (returns 1000 records)
     → Client (stores measures)
     → /api/chart-data (sends 1000 records back)
     → Client (receives transformed data)
```

### After (Target - Optimized)
```
Client → /api/chart-data (sends query params only)
     → Server fetches measures
     → Server transforms data
     → Client (receives transformed data + rawData for export)
```

## Implementation Plan

### Phase 1: Code Organization (Extract & Modularize)

#### Task 1: Backup current fetchChartData function structure ✅
- [x] Document current function line numbers (134-454)
- [x] Note current dependencies array: chartType, measure, frequency, practice, practiceUid, providerName, providerUid, startDate, endDate, groupBy, calculatedField, stableAdvancedFilters, stableMultipleSeries, dataSourceId
- [x] Document special cases: table (228-268), number (269-289), dual-axis (290-361), standard charts (362-444)

#### Task 2: Extract table chart fetching into separate function
- [ ] Create `fetchTableData()` helper function
- [ ] Move lines 247-287 into new function
- [ ] Keep data-source endpoint logic intact
- [ ] Test table charts work after extraction

#### Task 3: Extract number chart fetching into separate function
- [ ] Create `fetchNumberData()` helper function
- [ ] Move lines 288-308 into new function
- [ ] Keep measures API call for aggregation
- [ ] Test number charts work after extraction

#### Task 4: Extract dual-axis chart fetching into separate function
- [ ] Create `fetchDualAxisData()` helper function
- [ ] Move lines 309-380 into new function
- [ ] Keep parallel measure fetching logic
- [ ] Test dual-axis charts work after extraction

### Phase 2: Core Optimization (New Standard Flow)

#### Task 5: Create new fetchStandardChartData function
- [ ] Create helper function for line/bar/stacked-bar/etc charts
- [ ] Build request payload with query parameters (NOT measures array)
- [ ] Include: measure, frequency, dates, filters, groupBy, multipleSeries, periodComparison
- [ ] Make single POST to /api/admin/analytics/chart-data
- [ ] Handle response with chartData + rawData

#### Task 6: Rewrite main fetchChartData as dispatcher
- [ ] Keep try/catch/finally structure
- [ ] Add if/else chain for chart type routing
- [ ] Call fetchTableData() for table charts
- [ ] Call fetchNumberData() for number charts
- [ ] Call fetchDualAxisData() for dual-axis charts
- [ ] Call fetchStandardChartData() for all other charts
- [ ] Keep setIsLoading/setError state management

#### Task 7: Remove calculatedFieldsService from client
- [ ] Remove import of calculatedFieldsService
- [ ] Remove client-side calculated field processing (lines 377-395)
- [ ] Verify calculated fields work via server-side API

#### Task 8: Remove old measures API fetch logic
- [ ] Remove measures API call for standard charts (currently ~lines 381-444)
- [ ] Remove processedMeasures variable
- [ ] Remove mappedGroupBy logic
- [ ] Keep only for number/dual-axis special cases

#### Task 9: Update response handling for rawData
- [ ] Update setRawData to use API response.rawData
- [ ] Ensure export functionality receives raw data
- [ ] Remove intermediate data.measures references

#### Task 10: Remove unused URLSearchParams building
- [ ] Remove params building for standard charts (lines 146-244)
- [ ] Keep only for table/number/dual-axis special cases
- [ ] Clean up commented code

### Phase 3: Cleanup & Refactoring

#### Task 11: Remove verbose console.log statements
- [ ] Remove logs that dump full data arrays
- [ ] Keep only count/metadata logs if needed
- [ ] Remove: lines 141, 202-207, 211, 217-221, 252-259, 284-287, 290, 297-299, 306-308, 398-404, 418-421, 434-439

#### Task 12: Update fetchChartData dependency array
- [ ] Review all variables used in function
- [ ] Update dependency array at line 454
- [ ] Remove stableAdvancedFilters/stableMultipleSeries if no longer needed
- [ ] Add colorPalette, stackingMode if needed

### Phase 4: Comprehensive Testing

#### Task 13: Test standard chart types
- [ ] Test line charts load correctly
- [ ] Test bar charts load correctly
- [ ] Test stacked-bar charts load correctly
- [ ] Test horizontal-bar charts load correctly
- [ ] Test progress-bar charts load correctly
- [ ] Test pie/doughnut charts load correctly

#### Task 14: Test multiple series charts
- [ ] Create chart with 2+ series
- [ ] Verify all series render correctly
- [ ] Check legend displays all series
- [ ] Verify data accuracy

#### Task 15: Test period comparison charts
- [ ] Create chart with period comparison enabled
- [ ] Verify current vs comparison periods display
- [ ] Check labels are correct
- [ ] Verify data accuracy

#### Task 16: Test table charts (special case)
- [ ] Verify table charts still load
- [ ] Check data-source endpoint still works
- [ ] Verify columns render correctly
- [ ] Check pagination works

#### Task 17: Test number charts (special case)
- [ ] Verify number charts still load
- [ ] Check aggregation is correct
- [ ] Verify animated counter works
- [ ] Check formatting is correct

#### Task 18: Test dual-axis charts (special case)
- [ ] Verify dual-axis charts still load
- [ ] Check both measures display correctly
- [ ] Verify left/right axis labels
- [ ] Check expand/zoom functionality

#### Task 19: Verify chart export functionality
- [ ] Test CSV export works
- [ ] Test Excel export works
- [ ] Verify exported data matches chart
- [ ] Check rawData is available from API response

#### Task 20: Verify calculated fields (server-side)
- [ ] Create chart with calculated field
- [ ] Verify calculation happens server-side
- [ ] Check no client-side processing
- [ ] Verify accuracy of calculations

#### Task 21: Verify advanced filters
- [ ] Create chart with advanced filters
- [ ] Verify filters are sent in request
- [ ] Check filtered data is correct
- [ ] Test multiple filter combinations

#### Task 22: Verify date range presets
- [ ] Test "Last 30 Days" preset
- [ ] Test "Last Quarter" preset
- [ ] Test "Year to Date" preset
- [ ] Verify server-side date calculation

### Phase 5: Quality Assurance

#### Task 23: Run TypeScript compilation
- [ ] Run `pnpm tsc --noEmit`
- [ ] Fix any type errors
- [ ] Ensure strict type safety
- [ ] Verify no 'any' types used

#### Task 24: Run linting checks
- [ ] Run `pnpm lint`
- [ ] Fix any linting errors
- [ ] Follow CLAUDE.md guidelines
- [ ] Ensure code quality standards

#### Task 25: Verify network payload reduction
- [ ] Open browser DevTools Network tab
- [ ] Load chart with old flow (if available)
- [ ] Load chart with new flow
- [ ] Compare payload sizes
- [ ] Document reduction percentage

#### Task 26: Verify single API call per chart
- [ ] Open browser DevTools Network tab
- [ ] Load various chart types
- [ ] Count API calls per chart
- [ ] Verify: 1 call for standard charts, not 2
- [ ] Document findings

#### Task 27: Document breaking changes
- [ ] List any API changes
- [ ] Note any prop changes
- [ ] Document migration steps if needed
- [ ] Update relevant documentation

## Risk Mitigation

### High Risk Areas
1. **Export functionality** - Ensure rawData is properly returned from API
2. **Calculated fields** - Verify server-side processing works correctly
3. **Special chart types** - Don't break table/number/dual-axis during refactor

### Rollback Plan
If issues arise:
1. Git commit before starting Phase 2
2. Keep special cases (table/number/dual-axis) unchanged initially
3. Can revert to old flow for standard charts if needed

## Success Criteria
- ✅ All chart types render correctly
- ✅ Network payload reduced by ~90%
- ✅ API calls reduced from 2 to 1
- ✅ Export functionality works
- ✅ TypeScript compiles without errors
- ✅ Linting passes
- ✅ No console errors in browser

## Notes
- Server-side changes already complete and tested
- Client-side changes need careful incremental approach
- Test after each phase before proceeding
- Per CLAUDE.md: Quality over speed

## Current Status
📍 **Ready to begin Phase 1, Task 1**

Last updated: 2025-10-09
