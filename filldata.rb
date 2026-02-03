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
  name = doc.at_css("#appHubAppName").text.strip
  header_image = doc.at_css(".game_header_image_full")&.[]("src")
  icon_image = doc.at_css(".apphub_AppIcon img")&.[]("src")
  
  # Library Logo is usually hosted on Steam's CDN using the AppID
  library_logo = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/#{game_id}/logo.png"

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
  doc_ref = firestore.doc("artifacts/#{app_id}/public/data/games/#{game_data[:doc_id]}")
  
  doc_ref.set(game_data)
  puts "Successfully saved #{game_data[:name]} to Firestore."
end

# Main Execution
game_urls = [
  "https://store.steampowered.com/app/3376990/Kabuto_Park/",
"https://store.steampowered.com/app/3320800/Book_Bound/",
"https://store.steampowered.com/app/2744010/Urban_Jungle/",
"https://store.steampowered.com/app/3173740/Ghost_Frequency/",
"https://store.steampowered.com/app/3314790/CloverPit/",
"https://store.steampowered.com/app/2933290/Nightmare_Files_Clap_Clap/",
"https://store.steampowered.com/app/2504480/Indigo_Park_Chapter_1/",
"https://store.steampowered.com/app/2771670/Psychopomp/",
"https://store.steampowered.com/app/2796550/Rental/",
"https://store.steampowered.com/app/3200130/Mirrored_Phantoms/",
"https://store.steampowered.com/app/3827830/The_DeadLine/",
"https://store.steampowered.com/app/1541370/Ultimate_Theater_Simulator/",
"https://store.steampowered.com/app/998400/TransSiberian_Railway_Simulator/",
"https://store.steampowered.com/app/3150440/Laundry_Store_Simulator/",
"https://store.steampowered.com/app/2336220/Feed_the_Cups/",
"https://store.steampowered.com/app/1649950/News_Tower/",
"https://store.steampowered.com/app/1299460/Wanderstop/",
"https://store.steampowered.com/app/2133760/Tiny_Bookshop/",
"https://store.steampowered.com/app/3361510/Coal_LLC/",
"https://store.steampowered.com/app/3112170/Dice_Legends/",
"https://store.steampowered.com/app/3296910/Stash_A_Card_Looter/",
"https://store.steampowered.com/app/3035330/Dicealot/",
"https://store.steampowered.com/app/3160090/Slot__Dungeons/",
"https://store.steampowered.com/app/3509430/Replicat/",
"https://store.steampowered.com/app/2638050/Lost_For_Swords/",
"https://store.steampowered.com/app/3548520/DOG_WITCH/",
"https://store.steampowered.com/app/3519530/Merge_Maestro/",
"https://store.steampowered.com/app/2667120/Ballionaire/",
"https://store.steampowered.com/app/2824490/He_is_Coming/",
"https://store.steampowered.com/app/2825880/Death_Howl/",
"https://store.steampowered.com/app/2062430/BALL_x_PIT/",
"https://store.steampowered.com/app/3882730/PANOPTYCA__Idle_RPG_Manager/",
"https://store.steampowered.com/app/2427700/Backpack_Battles/",
"https://store.steampowered.com/app/3480990/There_Are_No_Orcs/",
"https://store.steampowered.com/app/2521630/Mini_Settlers/",
"https://store.steampowered.com/app/2784470/9_Kings/",
"https://store.steampowered.com/app/1162750/Songs_of_Syx/",
"https://store.steampowered.com/app/2346410/Border_Pioneer/",
"https://store.steampowered.com/app/2489330/Whiskerwood/",
"https://store.steampowered.com/app/3133060/Gnomes/",
"https://store.steampowered.com/app/2753900/The_King_is_Watching/",
"https://store.steampowered.com/app/3401490/Replicube/",
"https://store.steampowered.com/app/3934270/How_Many_Dudes/",
"https://store.steampowered.com/app/2161620/Lysfanga_The_Time_Shift_Warrior/"
]

game_urls.each do |url|
  data = scrape_steam_game(url)
  save_to_firestore(firestore, APP_ID, data) if data
end
