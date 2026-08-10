# Password Rotation Rule

## Rule
- **Never include actual passwords in artifacts**
- **Only document the fact of rotation**
- **Use placeholders like `postgresql://fpc:***@postgres:5432/processmap` or `${DB_DSN}`**

## Examples

### ❌ Wrong (includes actual password)
```bash
postgresql://fpc:oxUfi4xrMyVI0atZepEVxbueO@postgres:5432/processmap
```

### ✅ Correct (only fact of rotation)
```bash
# Password rotated successfully
# New password: ***
# Connection string: postgresql://fpc:***@postgres:5432/processmap
```

## Enforcement
- All artifacts must be sanitized before sharing
- Use environment variables for actual values
- Document only the rotation process, not the values
