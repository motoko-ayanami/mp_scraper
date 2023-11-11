const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

const AD_LINKS = [link,link2, etc];

async function declineCookies(page) {
    try {
        await page.waitForSelector('[data-testid="cookie-policy-manage-dialog-accept-button"]', { timeout: 5000 });
        await page.click('[data-testid="cookie-policy-manage-dialog-accept-button"]');
        console.log('Declined optional cookies.');
        await page.waitForTimeout(2000);
    } catch (error) {
        if (error.name === 'TimeoutError') {
            // If it's a timeout error, it means the selector was not found, so we can silently ignore it.
            console.log('Cookie popup not found, moving on.');
        } else {
            // If it's not a timeout error, we log it.
            console.log('Another error occurred while trying to decline cookies.', error);
        }
    }
}


async function loginToFacebook(page) {
    await page.goto('https://www.facebook.com/login');
    await declineCookies(page);
    await page.type('#email', 'INSERT_EMAIL_HERE');
    await page.type('#pass', 'INSERT_PASSWORD_HERE');
    await page.click('[name="login"]');
    await page.waitForTimeout(10000);
    await page.waitForSelector('body');
}

async function checkForBlock(page) {
    try {
        const blockedMessage = await page.$eval('body', (bodyEl) => {
            const text = bodyEl.innerText || bodyEl.textContent;
            return text.includes("You’re Temporarily Blocked") ? true : false;
        });

        if (blockedMessage) {
            console.log("Blocked by Facebook.");
            await page.waitForTimeout(3600000);
            return true;
        }
        return false;
    } catch (error) {
        console.log("Error checking for block:", error);
        return false;
    }
}

async function fetchAdsFromLink(page, adLink, fileName) {
    await page.goto(adLink);
    await page.waitForTimeout(10000);

    const isBlocked = await checkForBlock(page);
    if (isBlocked) return;

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

    let existingAds = [];
    if (fs.existsSync(fileName)) {
        existingAds = fs.readFileSync(fileName, 'utf-8').split('\n').filter(Boolean);
    }

    const newAds = ads.filter(ad => !existingAds.includes(ad));

    for (const ad of newAds) {
        const isRecent = await checkListingTime(page, ad);
        if (isRecent) {
            console.log(ad); // Print only if the ad was listed within minutes
            fs.appendFileSync(fileName, ad + '\n', 'utf-8'); // Append to file if it's a new and recent ad

            // Send the link to the Discord webhook
            await axios.post('INSERT_DISCORD_WEBHOOK_HERE', {
                content: ad
            }).catch(error => console.error('Error sending to Discord:', error));
        }
    }

    if (newAds.length) {
        fs.appendFileSync(fileName, newAds.join('\n') + '\n', 'utf-8');
    }
}

async function checkListingTime(page, adLink) {
    await page.goto(adLink);
    await page.waitForTimeout(3000); // Wait for 3 seconds to ensure the page loads

    // Scrape the entire HTML content of the page
    const pageContent = await page.content();
    
    // This regex looks for a pattern where the listing time is mentioned in minutes
    const minutesRegex = /\blisted\s+(\d+)\s+minutes?\s+ago\b/i;
    const isListedInMinutes = minutesRegex.test(pageContent);

    return isListedInMinutes;
}

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    await loginToFacebook(page);
    console.log('Logged in!');

    const fileName = 'facebook_listings.txt';

    while (true) {
        for (const adLink of AD_LINKS) {
            await fetchAdsFromLink(page, adLink, fileName);
        }

        // Generate a random wait time between 4 and 6 minutes (240000 to 360000 milliseconds)
        const waitTime = Math.random() * (360000 - 240000) + 240000;
        console.log(`Waiting for ${waitTime / 60000} minutes before checking the links again.`);
        await page.waitForTimeout(waitTime);
    }
})();
