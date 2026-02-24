# Fix Database for Passwordless Users

The `password_hash` column needs to be nullable to support passwordless users.

## Option 1: Run Migration (Recommended)

```bash
cd backend
node db/index.js migrate
```

## Option 2: Run SQL Manually

Connect to your PostgreSQL database and run:

```sql
ALTER TABLE users 
ALTER COLUMN password_hash DROP NOT NULL;
```

## Option 3: If using a fresh database

The migration file `0001_init_schema.sql` has been updated to allow NULL password_hash.
If you're creating a fresh database, it will work automatically.

## Verify the fix

After running the migration, test the OTP endpoint:

```bash
node test-otp-endpoint.js
```

Or use curl/Postman:
```bash
curl -X POST https://app.snowcityblr.com/api/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "phone": "+1234567890",
    "name": "Test User",
    "channel": "sms",
    "createIfNotExists": true
  }'
```

## Expected Response

```json
{
  "user_id": 1,
  "sent": true,
  "channel": "sms"
}
```

