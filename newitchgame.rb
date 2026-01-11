require "nokogiri"
require "open-uri"
require "google/cloud/firestore"
require "json"
require "cgi"

# Configuration
PROJECT_ID = "pakgamedev-com"
APP_ID = "1:482266938106:web:bad5c2745289a25b246743"
CREDENTIALS_PATH = "service.json"

# Initialize Firestore
firestore = Google::Cloud::Firestore.new(
  project_id: PROJECT_ID,
  credentials: CREDENTIALS_PATH
)

def scrape_itch_game(url)
  puts "Scraping Itch.io: #{url}..."
  
  html = URI.open(url, "User-Agent" => "Mozilla/5.0").read
  doc = Nokogiri::HTML(html)

  # Extract metadata using Itch.io specific selectors
  name = doc.at_css(".game_title")&.text&.strip
  
  # Itch.io usually uses a main 'header' image or a cover image
  header_image = doc.at_css("meta[property='og:image']")&.[]("content")
  
  # For the icon/thumbnail, we can look for the user/game icon
  icon_url = doc.at_css(".game_header .icon")&.[]("src") || header_image

  # Itch.io URLs don't have a numeric ID like Steam, so we use the URL slug
  # URL format: https://username.itch.io/game-title
  slug = url.split('/').last

  # Generate a clean doc_id
  doc_id = name.downcase.gsub(/[^0-9a-z ]/i, '').gsub(/ +/, '-')

  {
    url: url,
    name: name,
    header_image: header_image,
    library_logo: "", # Itch doesn't have a standard 'library logo' size, using header
    icon_image: icon_url,
    doc_id: doc_id
  }
rescue => e
  puts "Error scraping #{url}: #{e.message}"
  nil
end

def save_to_firestore(firestore, app_id, game_data)
  return if game_data.nil?

  # Path: /artifacts/{appId}/public/data/games/{doc_id}
  doc_ref = firestore.doc("artifacts/#{app_id}/public/data/games/#{game_data[:doc_id]}")
  
  doc_ref.set(game_data)
  puts "Successfully saved #{game_data[:name]} to Firestore."
end

# Interaction
print "Enter Itch.io Game URL: "
user_url = gets.chomp

if user_url.include?("itch.io")
  data = scrape_itch_game(user_url)
  save_to_firestore(firestore, APP_ID, data) if data
else
  puts "Invalid Itch.io URL."
end
