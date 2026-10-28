"""NFL EDGE — historical NFL betting analytics dashboard (entry point)."""
from pathlib import Path

import streamlit as st

st.set_page_config(page_title="NFL EDGE", page_icon="🏈", layout="wide", initial_sidebar_state="expanded")

from nfl_edge.ui.theme import inject_css  # noqa: E402  (after set_page_config)
from nfl_edge.ui.filters import render_sidebar  # noqa: E402
from views import betting, data_explorer, explorer, market, overview, teams  # noqa: E402

inject_css()

st.logo(str(Path(__file__).parent / "assets" / "logo.svg"), size="large")

pages = [
    st.Page(overview.render, title="Overview", icon=":material/space_dashboard:", url_path="overview", default=True),
    st.Page(teams.render, title="Team Analytics", icon=":material/groups:", url_path="teams"),
    st.Page(betting.render, title="Betting Trends", icon=":material/trending_up:", url_path="betting"),
    st.Page(explorer.render, title="Game Explorer", icon=":material/table_rows:", url_path="games"),
    st.Page(market.render, title="Odds & Market", icon=":material/query_stats:", url_path="market"),
    st.Page(data_explorer.render, title="Data Explorer", icon=":material/database:", url_path="data"),
]
nav = st.navigation(pages)
render_sidebar()
nav.run()
