# Seed Data Summary

## ✅ Successfully Seeded Data

All seed data has been loaded successfully with real Unsplash images!

## 📊 Data Overview

### Attractions (8 items)
1. **Snow Park Adventure** - ₹1,299 - Popular badge
2. **Ice Slide Thrills** - ₹799 - 15% discount, Hot Deal badge
3. **Penguin Encounter Zone** - ₹999 - New badge
4. **Snowball Arena** - ₹699 - 10% discount
5. **Ice Skating Rink** - ₹599 + ₹200/hour
6. **Snowman Building Workshop** - ₹499 - 5% discount, Family Favorite badge
7. **Ice Cave Exploration** - ₹1,499 - 20% discount, Premium badge
8. **Snow Tubing Adventure** - ₹899

**Features:**
- All attractions have real Unsplash images
- Gallery images included for main attractions
- Various badges (Popular, New, Hot Deal, Premium, Family Favorite)
- Different pricing models (flat rate, per hour)
- Discounts ranging from 0% to 20%

### Slots (Generated for 30 days)
- **Time Slots:** 7 slots per day per attraction
  - 09:00 - 10:30
  - 10:30 - 12:00
  - 12:00 - 13:30
  - 13:30 - 15:00
  - 15:00 - 16:30
  - 16:30 - 18:00
  - 18:00 - 19:30
- **Duration:** Next 30 days from current date
- **Total Slots:** 8 attractions × 7 slots/day × 30 days = 1,680 slots

### Combos (Multiple combinations)
- **Regular Combos:** 15% discount on paired attractions
- **Premium Combos:** 25% discount on special pairings
  - Ice Cave + Snow Park
  - Ice Cave + Ice Skating
  - Snow Park + Ice Skating
- **Auto-generated:** All valid attraction pairs

### Banners (7 items)
1. **Snow Park Adventure** - Links to Snow Park
2. **Ice Slide Thrills** - Links to Ice Slide
3. **Penguin Encounter Zone** - Links to Penguin Zone
4. **Ice Cave Exploration** - Links to Ice Cave
5. **Ice Skating Rink** - Links to Ice Skating
6. **Snowball Arena** - Links to Snowball Arena
7. **Winter Festival Special** - Links to Holiday Bonanza offer

**Features:**
- Separate web and mobile images (optimized sizes)
- Links to attractions or offers
- All banners are active

### Offers (4 items)
1. **Weekend Special** - 20% off, valid for 90 days
2. **Holiday Bonanza** - 25% off, valid for 60 days
3. **Happy Hour Deal** - 15% off (2 PM - 5 PM), valid for 30 days
4. **Family Package** - 30% off (3+ attractions), valid for 120 days

## 🖼️ Image Sources

All images are from Unsplash and optimized for web:
- **Web images:** 1200x600px
- **Mobile images:** 600x800px
- **Gallery images:** 800x600px

## 🚀 How to Use

### View Attractions
```bash
GET https://app.snowcity.blr/api/attractions
```

### View Slots
```bash
GET https://app.snowcity.blr/api/slots?attraction_id=1&date=2025-11-08
```

### View Combos
```bash
GET https://app.snowcity.blr/api/combos
```

### View Banners
```bash
GET https://app.snowcity.blr/api/banners
```

### View Offers
```bash
GET https://app.snowcity.blr/api/offers
```

## 📝 Notes

- All seed data uses real Unsplash images
- Slots are generated dynamically for the next 30 days
- Combos are auto-generated based on attraction pairs
- Banners link to attractions and offers
- All data is set to active by default

## 🔄 Re-seeding

To re-seed the data:
```bash
cd backend
node db/index.js seed
```

Note: Some seed files use `ON CONFLICT DO NOTHING` to prevent duplicates, while others update existing records.

## 📊 Database Statistics

After seeding, you should have:
- **8 attractions** with images and galleries
- **1,680+ slots** across 30 days
- **Multiple combos** (depends on attraction pairs)
- **7 banners** with web/mobile images
- **4 offers** with various discount rules

## 🎨 Image Credits

All images are from [Unsplash](https://unsplash.com) and are free to use:
- Winter/Snow themes
- Adventure/Sports themes
- Family-friendly content
- High-quality, professional photography

