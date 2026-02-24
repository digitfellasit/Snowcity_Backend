// routes/instagram.routes.js
const router = require('express').Router();
const axios = require('axios');

// Get latest 6 Instagram posts
router.get('/instagram', async (req, res) => {
  try {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const userId = process.env.INSTAGRAM_USER_ID;

    if (!accessToken || !userId) {
      return res.status(500).json({ error: 'Instagram API credentials not configured' });
    }

    const url = `https://graph.instagram.com/${userId}/media?fields=id,media_type,media_url,permalink,caption,thumbnail_url,timestamp&access_token=${accessToken}&limit=6`;

    const response = await axios.get(url);
    const posts = response.data.data;

    res.json({ posts });
  } catch (error) {
    console.error('Error fetching Instagram posts:', error);
    res.status(500).json({ error: 'Failed to fetch Instagram posts' });
  }
});

module.exports = router;
