# Testing OTP Endpoints - Guide

## ✅ Database Migration Complete

The database has been updated to support passwordless users. The `password_hash` column is now nullable.

## 🚀 How to Start the Server

### Option 1: Using npm (if you have a dev script)
```bash
cd backend
npm run dev
```

### Option 2: Using node directly
```bash
cd backend
node server.js
```

### Option 3: Using nodemon (if installed)
```bash
cd backend
npx nodemon server.js
```

The server should start on `https://app.snowcityblr.com` (or the PORT specified in your `.env` file).

## 🧪 Testing the OTP Endpoint

### 1. Check Server Health
```bash
curl https://app.snowcityblr.com/health
```

Expected response:
```json
{
  "status": "ok",
  "uptime": 123.456,
  "timestamp": "2025-11-08T08:00:00.000Z"
}
```

### 2. Send OTP (Create User)
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

Expected response:
```json
{
  "user_id": 1,
  "sent": true,
  "channel": "sms"
}
```

### 3. Verify OTP
```bash
curl -X POST https://app.snowcityblr.com/api/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "otp": "123456",
    "email": "test@example.com"
  }'
```

Expected response:
```json
{
  "verified": true,
  "user": {
    "user_id": 1,
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+1234567890",
    "otp_verified": true
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-11-15T08:00:00.000Z"
}
```

## 🔍 Frontend Testing

### Using fetch in browser console:
```javascript
// Send OTP
fetch('https://app.snowcityblr.com/api/auth/otp/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'test@example.com',
    phone: '+1234567890',
    name: 'Test User',
    channel: 'sms',
    createIfNotExists: true
  })
})
.then(res => res.json())
.then(data => console.log('OTP Sent:', data))
.catch(err => console.error('Error:', err));
```

### Using axios (if you have it):
```javascript
import axios from 'axios';

axios.post('https://app.snowcityblr.com/api/auth/otp/send', {
  email: 'test@example.com',
  phone: '+1234567890',
  name: 'Test User',
  channel: 'sms',
  createIfNotExists: true
})
.then(response => console.log('OTP Sent:', response.data))
.catch(error => console.error('Error:', error.response?.data || error.message));
```

## 🐛 Troubleshooting

### Error: "Not Found" (404)
- ✅ **Fixed**: The route is now properly registered
- Make sure the server is running
- Check that you're using the correct URL: `https://app.snowcityblr.com/api/auth/otp/send`

### Error: "password_hash violates not-null constraint"
- ✅ **Fixed**: Database migration has been applied
- If you still see this error, run the migration again:
  ```bash
  node db/index.js migrate
  ```

### Error: "Validation error"
- Check that you're sending the required fields:
  - At least one of: `user_id`, `email`, or `phone`
  - `name` is required if `createIfNotExists: true`
  - `email` must be a valid email format
  - `phone` must match the format: `^[0-9+\-\s()]{7,20}$`

### Error: "User not found"
- If `createIfNotExists: false` (default), the user must already exist
- Set `createIfNotExists: true` to create a new user

### OTP Not Received
- Check your Twilio/SMS configuration in `.env`
- Check your email configuration in `.env`
- Check server logs for errors
- In development, OTP is usually logged to console (check server logs)

## 📝 API Endpoints Summary

### Authentication
- `POST /api/auth/register` - Register user (password optional)
- `POST /api/auth/login` - Login (password optional for regular users)
- `POST /api/auth/otp/send` - Send OTP
- `POST /api/auth/otp/verify` - Verify OTP (returns token)
- `POST /api/auth/logout` - Logout (requires token)

### Bookings
- `POST /api/bookings` - Create booking (optional auth)
- `POST /api/bookings/otp/send` - Send OTP for guest booking
- `POST /api/bookings/otp/verify` - Verify OTP and assign booking
- `POST /api/bookings/:id/pay/payphi/initiate` - Initiate payment (requires auth)

## ✅ Next Steps

1. Start your server: `node server.js` or `npm run dev`
2. Test the OTP endpoint using the examples above
3. Update your frontend to use the new endpoints
4. Test the complete booking flow:
   - Create booking (guest)
   - Send OTP
   - Verify OTP
   - Initiate payment

## 📚 Additional Resources

- See `FIX_DATABASE.md` for database migration details
- Check server logs in `backend/logs/` for debugging
- Review `backend/routes/auth.routes.js` for route definitions

