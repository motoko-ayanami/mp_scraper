const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');
const { DateTime } = require('luxon');

const DISCORD_WEBHOOK_URL = 'ENTER_DISCORD_WEBHOOK_HERE';

const AD_LINKS = [
'ENTER_LINKS_HERE'
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function pauseIfMidnightTo7am() {
    const nowInEasternTime = DateTime.now().setZone("America/Montreal");
    const currentHour = nowInEasternTime.hour;

    if (currentHour < 7) {
        console.log("Pausing script execution because it's between midnight and 7 AM Eastern Time.");
        const msTill7 = nowInEasternTime.startOf('day').plus({ hours: 7 }).diff(nowInEasternTime, 'milliseconds').milliseconds;
        await sleep(msTill7);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

Date.prototype.dst = function() {
    const jan = new Date(this.getFullYear(), 0, 1).getTimezoneOffset();
    const jul = new Date(this.getFullYear(), 6, 1).getTimezoneOffset();
    return Math.min(jan, jul) === this.getTimezoneOffset();
};

async function declineCookies(page) {
    try {
        await page.waitForSelector('[data-testid="cookie-policy-manage-dialog-accept-button"]', { timeout: 5000 });
        await page.click('[data-testid="cookie-policy-manage-dialog-accept-button"]');
        console.log('Declined optional cookies.');
        await page.waitForTimeout(2000); 
    } catch (error) {
        console.log('Cookie popup not found or another error occurred while trying to decline cookies.', error);
    }
}

async function loginToFacebook(page) {
    await page.goto('https://www.facebook.com/login');
    await declineCookies(page);
    await page.type('#email', 'ENTER_EMAIL_HERE');
    await page.type('#pass', 'ENTER_PASSWORD_HERE');
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
            console.log("Blocked by Facebook. Sending alert to Discord.");
            await page.waitForTimeout(3600000);
            return true;
        }
        return false;
    } catch (error) {
        console.log("Error checking for block:", error);
        return false;
    }
}

async function sendToDiscord(adLinks) {
    try {
        for (const link of adLinks) {
            await axios.post(DISCORD_WEBHOOK_URL, {
                content: link
            });
            console.log(`Sent new ad ${link} to Discord`);
            await sleep(1000);
        }
    } catch (error) {
        console.error('Error sending message to Discord', error);
    }
}

async function isNewAdvertisement(page, adLink) {
    await page.goto(adLink);
    await page.waitForTimeout(5000);

    return await page.evaluate(() => {
        const bodyText = document.body.innerText || document.body.textContent;
        const sentences = bodyText.split('.').map(sentence => sentence.trim());
        for (const sentence of sentences) {
            if (sentence.includes("listed") && sentence.includes("minutes")) {
                return true;
            }
        }
        return false;
    });
}

async function fetchAdsFromLink(page, adLink) {
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

    const fileName = 'facebook_listings_' + adLink.split('longitude=')[1].split('&')[0] + '.txt';
    let isFirstRun = false;
    let previousAds = [];
    
    if (fs.existsSync(fileName)) {
        previousAds = fs.readFileSync(fileName, 'utf-8').split('\n').filter(Boolean);
    } else {
        isFirstRun = true;
    }

    let adsToSend = [];

    for (const ad of ads) {
        if (!previousAds.includes(ad) && await isNewAdvertisement(page, ad)) {
            adsToSend.push(ad);
        }
    }

    fs.writeFileSync(fileName, ads.join('\n'), 'utf-8');

    if (adsToSend.length && !isFirstRun) {
        await sendToDiscord(adsToSend);
    } else {
        console.log(`No new advertisements found for ${adLink}.`);
    }
}

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    await loginToFacebook(page);
    console.log('Logged in!');

    while (true) {
        await pauseIfMidnightTo7am();

        for (const adLink of AD_LINKS) {
            await fetchAdsFromLink(page, adLink);
        }

        console.log("Waiting for 4 minutes before checking the links again.");
        await page.waitForTimeout(240000);
    }
})();
