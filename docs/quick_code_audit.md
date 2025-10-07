Perform a comprehensive security and quality audit of all code changes just made. Review for:

## Security Issues (CRITICAL)
- SQL injection, XSS, CSRF vulnerabilities
- Exposed secrets, API keys, or sensitive data in code
- Insecure authentication/authorization patterns
- Missing input validation and sanitization
- Unsafe use of dangerouslySetInnerHTML or eval()
- Inadequate rate limiting or request validation
- CORS misconfigurations
- Insecure dependencies or outdated packages
- Missing HTTPS enforcement
- Improper error handling that leaks sensitive information
- Session management weaknesses
- File upload vulnerabilities
- Command injection risks

## Next.js Specific Security
- Server Components vs Client Components - proper data handling
- API route authentication and authorization
- Environment variable exposure (client vs server)
- Middleware security implementations
- Static vs dynamic rendering security implications
- Server Actions validation and error handling

## Code Quality & Optimization
- Unused imports, variables, or functions
- Console.logs or debug code left in
- Inefficient algorithms or unnecessary re-renders
- Missing error boundaries
- Unhandled promise rejections
- Memory leaks (event listeners, subscriptions)
- Bundle size concerns (heavy imports)
- Missing loading states or error states
- N+1 query problems

## Best Practices & Standards
- TypeScript types - any 'any' types that should be specific
- Consistent naming conventions (camelCase, PascalCase, etc.)
- Proper component structure and organization
- Accessibility issues (ARIA labels, semantic HTML, keyboard navigation)
- Missing prop validation or TypeScript interfaces
- Inconsistent error handling patterns
- Hard-coded values that should be environment variables
- Magic numbers or strings without constants
- Deviations from established project patterns
- Missing JSDoc comments for complex functions

## Performance
- Missing React.memo, useMemo, or useCallback where needed
- Inefficient useEffect dependencies
- Large components that should be code-split
- Missing image optimization (Next.js Image component)
- Blocking operations on main thread

## Testing & Maintainability
- Missing edge case handling
- Lack of defensive programming
- Code that's difficult to test
- Tight coupling between components
- Missing null/undefined checks

Provide a prioritized list: CRITICAL (security), HIGH (functionality/performance), MEDIUM (best practices), LOW (code style). For each issue found, explain the risk and suggest a specific fix.