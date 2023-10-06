import requests
from bs4 import BeautifulSoup
import os

# Define directory and file paths
DESKTOP_PATH = os.path.join(os.path.expanduser('~'), 'Desktop')
DIRECTORY_NAME = 'Kijiji_Ad_Tracker'
FULL_DIR_PATH = os.path.join(DESKTOP_PATH, DIRECTORY_NAME)

if not os.path.exists(FULL_DIR_PATH):
    os.makedirs(FULL_DIR_PATH)

# URLs and corresponding filenames
URLS = {
    'little_italy': {
        'url': 'https://www.kijiji.ca/b-apartments-condos/ville-de-montreal/2+bedrooms__2+bedroom+den/c37l1700281a27949001?radius=2.0&price=1600__2400&address=Little+Italy%2C+Rosemont-La+Petite-Patrie%2C+Montreal%2C+QC&ll=45.5324569%2C-73.6113766',
        'filename': os.path.join(FULL_DIR_PATH, 'last_seen_ads_little_italy.txt')
    },
    'plateau_mont_royal': {
        'url': 'https://www.kijiji.ca/b-appartement-condo/ville-de-montreal/4+1+2__4+1+2+et+coin+detente/c37l1700281a27949001?radius=2.0&price=1600__2400&address=Plateau+Mont-Royal%2C+Le+Plateau-Mont-Royal%2C+Montr%C3%A9al%2C+QC&ll=45.5238964%2C-73.5710272',
        'filename': os.path.join(FULL_DIR_PATH, 'last_seen_ads_plateau_mont_royal.txt')
    }
}

BASE_URL = 'https://www.kijiji.ca'
DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1159691614155968642/Iveu7M1OhHZiFuy7Dfi1RqGR30kjjpNVe_yadUUl7OD7gwIpWdREbpb2V45uRz8Ot_ed'

def get_last_seen_ads(filename):
    if not os.path.exists(filename):
        return None

    with open(filename, 'r') as file:
        return set(line.strip() for line in file.readlines())

def store_last_seen_ads(filename, ads):
    with open(filename, 'w') as file:
        for ad in ads:
            file.write(ad + '\n')

def listing_filter(tag):
    return tag.name == 'li' and tag.attrs.get('data-testid', '').startswith('listing-card-list-item-')

def send_discord_alert(webhook_url, message):
    data = {"content": message}
    response = requests.post(webhook_url, json=data)
    return response.status_code == 204

def get_new_ads(url, last_seen_ads):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.text, 'html.parser')
    listings = soup.find_all(listing_filter)
    
    new_ads = [BASE_URL + listing.find('a', {'data-testid': 'listing-link'})['href'] for listing in listings if BASE_URL + listing.find('a', {'data-testid': 'listing-link'})['href'] not in last_seen_ads]
    return new_ads

# Process both URLs
for key, data in URLS.items():
    last_seen_ads = get_last_seen_ads(data['filename'])
    
    # If file doesn't exist, just get the ads and save them without sending notifications
    if last_seen_ads is None:
        last_seen_ads = set()
        new_ads = get_new_ads(data['url'], last_seen_ads)
        last_seen_ads.update(new_ads)
        store_last_seen_ads(data['filename'], last_seen_ads)
        print(f"Ads stored for {key} without sending notifications.")
        for ad in new_ads:
            print(ad)
        continue

    new_ads = get_new_ads(data['url'], last_seen_ads)
    
    # Print the results and send alerts to Discord
    if new_ads:
        print(f"New advertisements found for {key}:")
        for ad in new_ads:
            print(ad)
            alert_msg = f"New advertisement found for {key}: {ad}"
            send_discord_alert(DISCORD_WEBHOOK_URL, alert_msg)
        last_seen_ads.update(new_ads)
        store_last_seen_ads(data['filename'], last_seen_ads)
    else:
        print(f"No new advertisements found for {key}.")
