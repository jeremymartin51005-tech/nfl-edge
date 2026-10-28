"""Download / refresh the nflverse games dataset into data/raw/games.csv."""
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from nfl_edge.loader import GAMES_FILE, SOURCE_URL  # noqa: E402

if __name__ == "__main__":
    GAMES_FILE.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {SOURCE_URL}")
    urllib.request.urlretrieve(SOURCE_URL, GAMES_FILE)
    print(f"Saved to {GAMES_FILE} ({GAMES_FILE.stat().st_size / 1024:.0f} KB)")
