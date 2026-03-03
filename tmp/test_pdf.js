
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Mock data to match what getFullOrderData would return
const mockData = {
    orderId: 12345,
    orderRef: 'SCHQGRJC',
    totalAmount: 650,
    discountAmount: 0,
    couponCode: null,
    orderDate: new Date(),
    guestName: 'Vishal',
    guestPhone: '+91 98406 20700',
    guestEmail: 'vishal@example.com',
    items: [
        {
            item_title: 'Snow Park',
            booking_date: new Date(),
            slot_start_time: '11:00:00',
            slot_end_time: '12:00:00',
            quantity: 1,
            addons: [
                { title: 'Food Voucher', price: 100, quantity: 1 }
            ]
        },
        {
            item_title: 'MadLabs',
            booking_date: new Date(),
            slot_start_time: '12:00:00',
            slot_end_time: '13:00:00',
            quantity: 1
        }
    ],
};

// Colors from ticketService.js
const C = {
    white: '#FFFFFF',
    veryLight: '#999999',
    lightText: '#666666',
    text: '#222222',
    cardBorder: '#E0E0E0',
    pageBg: '#FFFFFF',
};

// Re-implementing drawConsolidatedTicket logic locally for verification since we can't easily mock the entire service
async function testDraw(doc, data) {
    const { orderRef, items, totalAmount, guestName, guestPhone, orderDate } = data;
    const PW = doc.page.width;
    const PH = doc.page.height;
    const M = 40;

    // Header
    doc.rect(0, 0, PW, 100).fill(C.white);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#044DCE')
        .text(orderRef, PW - M - 160, 38, { width: 160, align: 'right' });

    // Banner
    const bannerY = 100;
    const bannerH = 120;

    // Simulate Gradient
    doc.rect(0, bannerY, PW, bannerH).fill('#0099FF');

    // "Your Booking is Confirmed!" text (NEW)
    doc.save();
    doc.font('Helvetica-Bold').fontSize(32).fillColor(C.white)
        .text('Your Booking is Confirmed!', 0, bannerY + 45, { width: PW, align: 'center' });
    doc.restore();

    let y = bannerY + bannerH + 15;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#044DCE')
        .text('Below is a summary of your booking', M, y);
    y += 40;

    items.forEach((item) => {
        let cardH = 85;
        if (item.addons && item.addons.length > 0) cardH += 30;

        doc.rect(M, y, PW - (M * 2), cardH).strokeColor(C.cardBorder).lineWidth(0.5).stroke();
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#044DCE')
            .text(item.item_title, M + 14, y + 12);

        // Check if "Arrive 15 mins early" box is gone (implicit by not adding it)
        y += cardH + 15;
    });

    // Total
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#D8973C')
        .text(`Rs. ${totalAmount}`, M, y + 12);
}

const doc = new PDFDocument({ size: 'A4', margin: 0 });
const outPath = path.join('c:/Users/dfuser/Desktop/New/Snowcity-Backend-main', 'tmp', 'test_ticket.pdf');
const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

testDraw(doc, mockData).then(() => {
    doc.end();
    console.log('PDF generated at:', outPath);
});
