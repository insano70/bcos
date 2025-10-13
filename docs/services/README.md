# Service Layer Standards Documentation

**Quick Start**: Read [STANDARDS.md](./STANDARDS.md) first. Refer to [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) when you need them.

---

## 📚 Documentation Structure

### [STANDARDS.md](./STANDARDS.md) - **Start Here** (~600 lines)
Core patterns that **every service must follow**. Read this first before writing any service.

**Contents**:
- ✅ Architecture pattern (hybrid approach)
- ✅ Gold standard template
- ✅ Permission checking
- ✅ Logging requirements
- ✅ Error handling
- ✅ Type safety
- ✅ Required database indexes
- ✅ Common anti-patterns
- ✅ Quick checklist

**When to read**: 
- Before creating any new service
- During code review
- When unsure about basic patterns

**Time to read**: 15-20 minutes

---

### [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) - **Reference** (~2,500 lines)
Advanced patterns for production systems. **Reference as needed** - don't need to read cover-to-cover.

**Contents**:
- 🚀 Performance optimization (N+1 queries, large datasets)
- 📄 Pagination patterns (cursor vs offset)
- 💾 Caching strategies
- 🧪 Testing strategies
- 🔗 Service composition
- 🔄 Idempotency
- ⚡ Rate limiting
- 🛡️ Circuit breakers
- 🎛️ Feature flags
- 📊 Monitoring & alerting
- 🔒 Advanced security patterns

**When to read**:
- When you hit a specific problem (search for it)
- When scaling services
- When adding resilience patterns
- Before production deployment

**Time to read**: Reference only - search for what you need

---

## 🎯 Quick Decision Tree

### "I'm creating my first service"
→ Read [STANDARDS.md](./STANDARDS.md) top to bottom  
→ Copy the gold standard template  
→ Follow the checklist at the end

### "I'm getting N+1 query warnings"
→ Go to [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) → "Performance Optimization"

### "I need to paginate through 100k records"
→ Go to [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) → "Pagination Patterns"

### "External API keeps failing"
→ Go to [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) → "Circuit Breakers"

### "Users are abusing my endpoint"
→ Go to [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) → "Rate Limiting"

### "I need to test my service"
→ Go to [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) → "Testing Strategy"

### "My service needs caching"
→ Go to [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) → "Caching Strategy"

### "Code review feedback"
→ Check [STANDARDS.md](./STANDARDS.md) → "Anti-Patterns" section

---

## 📖 Learning Path

### Week 1: Fundamentals
1. Read STANDARDS.md completely
2. Create a simple CRUD service using the template
3. Get it reviewed by a senior engineer

### Week 2-3: Real Services
1. Build services for your features
2. Reference ADVANCED_PATTERNS.md as needed
3. Focus on RBAC and logging

### Month 2+: Production Readiness
1. Add advanced patterns from ADVANCED_PATTERNS.md:
   - Pagination for large datasets
   - Caching for frequently accessed data
   - Rate limiting for public endpoints
   - Circuit breakers for external APIs

---

## 🔍 Quick Search Guide

**Looking for...**

| Topic | Document | Section |
|-------|----------|---------|
| How to structure a service | STANDARDS.md | Gold Standard Template |
| Permission checking | STANDARDS.md | Permission Checking |
| Logging format | STANDARDS.md | Logging Requirements |
| Error handling | STANDARDS.md | Error Handling |
| Database indexes | STANDARDS.md | Database Requirements |
| N+1 query problems | ADVANCED_PATTERNS.md | Performance Optimization |
| Pagination | ADVANCED_PATTERNS.md | Pagination Patterns |
| Caching | ADVANCED_PATTERNS.md | Caching Strategy |
| Testing | ADVANCED_PATTERNS.md | Testing Strategy |
| Rate limiting | ADVANCED_PATTERNS.md | Rate Limiting |
| Circuit breakers | ADVANCED_PATTERNS.md | Circuit Breakers |
| Feature flags | ADVANCED_PATTERNS.md | Feature Flags |
| Monitoring | ADVANCED_PATTERNS.md | Monitoring & Alerting |

---

## 🎓 For Code Reviewers

### Checklist for Service PRs

**Required (from STANDARDS.md)**:
- [ ] Uses hybrid pattern (internal class + factory)
- [ ] Has service interface exported
- [ ] Permissions checked in constructor
- [ ] Uses logTemplates for CRUD operations
- [ ] Has try-catch in every method
- [ ] No `any` types
- [ ] Has required database indexes documented

**Nice to Have (from ADVANCED_PATTERNS.md)**:
- [ ] Has cursor pagination for large datasets
- [ ] Has idempotency for create operations
- [ ] Has unit tests
- [ ] Has caching if appropriate
- [ ] Has rate limiting if public endpoint

### Quick Review Questions

1. **"Does this service follow STANDARDS.md?"**  
   Check: Hybrid pattern, logTemplates, permissions, error handling

2. **"Does this service need advanced patterns?"**  
   Ask: Large datasets? External APIs? Public endpoint? High traffic?

3. **"Is this service testable?"**  
   Check: Dependencies injected? Pure functions? No hidden state?

---

## 📝 Contributing

### Adding to STANDARDS.md
Only add patterns that:
- ✅ Every service must follow
- ✅ Are simple and essential
- ✅ Take < 5 minutes to understand

Keep STANDARDS.md under 700 lines!

### Adding to ADVANCED_PATTERNS.md
Add patterns that:
- ✅ Solve specific production problems
- ✅ Are optional/situational
- ✅ Require deeper understanding

---

## 🆘 Getting Help

- **Questions about basics?** → Ask in #engineering, reference STANDARDS.md
- **Questions about advanced patterns?** → Ask in #engineering, reference specific section in ADVANCED_PATTERNS.md
- **Need review?** → Tag @service-standards-team in PR
- **Found a gap?** → Update the relevant document and submit PR

---

## 📊 Document Stats

| Document | Lines | Purpose | Read Time |
|----------|-------|---------|-----------|
| README.md | ~150 | Navigation | 5 min |
| STANDARDS.md | ~600 | Core patterns | 15-20 min |
| ADVANCED_PATTERNS.md | ~2,500 | Reference | As needed |

---

## 🔄 Version History

- **v3.0** (2025-01-13): Split into focused documents for better usability
- **v2.0** (2025-01-13): Added advanced patterns
- **v1.0** (2025-01-13): Initial release

---

**Remember**: You don't need to know everything in ADVANCED_PATTERNS.md upfront. Start with STANDARDS.md, then reference advanced patterns when you need them.
