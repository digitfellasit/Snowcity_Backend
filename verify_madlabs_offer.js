
const dayjs = require('dayjs');

async function verifyOffer() {
  const nextFriday = dayjs().add(1, 'week').day(5).format('YYYY-MM-DD');
  console.log('--- Offer Verification Script ---');
  console.log('Target Date (Next Friday):', nextFriday);
  console.log('Target Attraction ID: 21 (MadLabs)');

  try {
    // 1. Get Attraction Base Price
    const attrRes = await fetch('http://localhost:4000/api/attractions/21');
    const attrData = await attrRes.json();
    const attraction = attrData.data || attrData;
    const basePrice = attraction.pricing?.base_price || attraction.base_price || 500;
    console.log('Step 1: Attraction Base Price:', basePrice);

    // 2. Get Active Offers
    const offersRes = await fetch('http://localhost:4000/api/offers?active=true');
    const offersData = await offersRes.json();
    const allOffers = offersData.data || offersData;

    // 3. Find Madlabs Offer and its rules
    const offer = allOffers.find(o => o.offer_id == 43 || o.title.includes('Madlabs Special'));
    if (!offer) {
      console.log('Error: Madlabs Offer (ID 43) not found in active offers list!');
      return;
    }
    console.log('Step 2: Found Offer:', offer.title, '(ID: ' + offer.offer_id + ')');
    console.log('Rules found:', offer.rules ? offer.rules.length : 0);

    if (!offer.rules || offer.rules.length === 0) {
      console.log('Error: No rules found for this offer!');
      return;
    }

    // 4. Simulate Frontend Matching (Next Friday)
    const nextFridayDay = dayjs(nextFriday).day(); // should be 5
    const matchingRule = offer.rules.find(rule => {
      // Check day_type
      if (rule.day_type === 'custom' && rule.specific_days && rule.specific_days.includes(nextFridayDay)) {
        return true;
      }
      return false;
    });

    if (!matchingRule) {
      console.log('Error: No matching rule found for next Friday (Day 5)!');
      return;
    }
    console.log('Step 3: Matching Rule Found (ID: ' + matchingRule.rule_id + ')');

    // 5. Calculate Discount
    const discountType = matchingRule.rule_discount_type || offer.discount_type;
    const discountValue = matchingRule.rule_discount_value || offer.discount_value;
    console.log('Step 4: Discount Type:', discountType, 'Value:', discountValue);

    let finalPrice = basePrice;
    if (discountType === 'amount') {
      finalPrice = basePrice - discountValue;
    } else if (discountType === 'percent') {
      finalPrice = basePrice * (1 - discountValue / 100);
    }

    console.log('--- Result ---');
    console.log('Expected Final Price for Next Friday:', finalPrice);
    if (finalPrice == 299) {
      console.log('SUCCESS: Offer successfully applies! (299)');
    } else {
      console.log('FAILURE: Final price is not 299.');
    }

  } catch (err) {
    console.error('Verification failed:', err.message);
  }
}

verifyOffer();
