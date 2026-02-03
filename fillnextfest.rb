require "nokogiri"
require "open-uri"
require "google/cloud/firestore"
require "json"
require "cgi"

# Configuration
PROJECT_ID = "pakgamedev-com"
APP_ID = "1:482266938106:web:bad5c2745289a25b246743"
CREDENTIALS_PATH = __dir__ + "/service.json"

# Initialize Firestore with hardcoded credentials path
firestore = Google::Cloud::Firestore.new(
  project_id: PROJECT_ID,
  credentials: CREDENTIALS_PATH
)

def scrape_steam_game(url)
  puts "Scraping: #{url}..."
  
  # Append l=english to ensure consistent naming/metadata
  target_url = url.include?("?") ? "#{url}&l=english" : "#{url}?l=english"
  
   headers = {
    "User-Agent" => "Mozilla/5.0",
    "Cookie" => "lastagecheckage=1-0-1990; birthtime=631180801; mature_content=1"
  }
  
  html = URI.open(target_url, headers).read
  doc = Nokogiri::HTML(html)

  # Extract Game ID from URL for asset construction
  game_id = url.match(/\/app\/(\d+)/)&.[](1)
  
  # Basic Metadata
  name = "Steam Next Fest"
  header_image = doc.at_css('meta[property="og:image"]')&.[]("content")
  icon_image = ""
  
  # Library Logo is usually hosted on Steam's CDN using the AppID
  library_logo = ""

  doc_id = name.downcase.gsub(/[^0-9a-z ]/i, '').gsub(/ +/, '-')

  {
    url: url,
    name: name,
    doc_id: doc_id,
    icon_image: icon_image,
    header_image: header_image,
    library_logo: library_logo,
  }
rescue => e
  puts "Error scraping #{url}: #{e.message}"
  nil
end

def save_to_firestore(firestore, app_id, game_data)
  return if game_data.nil?
  puts "Saving to #{game_data[:doc_id]}"
  # Following Rule 1: /artifacts/{appId}/public/data/games
  doc_ref = firestore.doc("artifacts/#{app_id}/public/data/current/game")
  
  doc_ref.set(game_data)
  puts "Successfully saved #{game_data[:name]} to Firestore."
end

# Main Execution
game_urls = [
"https://store.steampowered.com/sale/nextfest"
]

game_urls.each do |url|
  data = scrape_steam_game(url)
  save_to_firestore(firestore, APP_ID, data) if data
end
