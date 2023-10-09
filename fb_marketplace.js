const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

const USERNAME = '';
const PASSWORD = '';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/';

const AD_LINKS = [
    'https://www.facebook.com/marketplace/category/propertyrentals?minPrice=1800&maxPrice=2500&minBedrooms=2&sortBy=creation_time_descend&exact=false&latitude=45.5415&longitude=-73.6185&radius=1',
    'https://www.facebook.com/marketplace/category/propertyrentals?minPrice=1800&maxPrice=2500&minBedrooms=2&sortBy=creation_time_descend&exact=false&latitude=45.5174&longitude=-73.5696&radius=1'
];

async function loginToFacebook(page) {
    await page.goto('https://www.facebook.com/login');
    await page.type('#email', USERNAME);
    await page.type('#pass', PASSWORD);
    await page.click('[name="login"]');
    await page.waitForTimeout(10000);
    await page.waitForSelector('body');
}

async function fetchAdsFromLink(page, adLink) {
    await page.goto(adLink);
    await page.waitForTimeout(10000);

    const ads = await page.evaluate(() => {
        const listingNodes = document.querySelectorAll('a[tabindex="0"]');
        const rawLinks = Array.from(listingNodes).map(node => node.href);
        return rawLinks.filter(link => link.includes('/marketplace/item/'))
                       .map(link => {
                           const match = link.match(/(https:\/\/www\.facebook\.com\/marketplace\/item\/\d+)/);
                           return match ? match[1] : null;
                       })
                       .filter(Boolean);
    });

    const fileName = 'facebook_listings_' + adLink.split('longitude=')[1].split('&')[0] + '.txt';
    let isFirstRun = false;
    let previousAds = [];
    
    if (fs.existsSync(fileName)) {
        previousAds = fs.readFileSync(fileName, 'utf-8').split('\n').filter(Boolean);
    } else {
        isFirstRun = true;
    }

    const newAds = ads.filter(ad => !previousAds.includes(ad));

    fs.writeFileSync(fileName, ads.join('\n'), 'utf-8');

    if (newAds.length && !isFirstRun) {
        console.log(`New advertisements found for ${adLink}:`, newAds);
        for (const ad of newAds) {
            await axios.post(DISCORD_WEBHOOK_URL, {
                content: `New listing found: ${ad}`
            });
        }
    } else {
        console.log(`No new advertisements found for ${adLink}.`);
    }
}

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    // Log into Facebook once
    await loginToFacebook(page);

    // Loop through each link and fetch the ads
    for (const adLink of AD_LINKS) {
        await fetchAdsFromLink(page, adLink);
    }

    await browser.close();
})();
