"""Render every page headlessly and fail on any exception."""
import pytest
from streamlit.testing.v1 import AppTest



def _runner(module: str) -> str:
    return f"""
import streamlit as st
from nfl_edge.ui.theme import inject_css
from nfl_edge.ui.filters import render_sidebar
from views import {module}
inject_css()
render_sidebar()
{module}.render()
"""


@pytest.mark.parametrize("module", ["overview", "teams", "betting", "explorer", "market", "data_explorer"])
@pytest.mark.parametrize("state", [{}, {"f_seasons": (2023, 2023)}, {"f_team": "DET"},
                                   {"f_types": ["Postseason"], "f_neutral": False}])
def test_page_renders(module, state):
    at = AppTest.from_string(_runner(module), default_timeout=60)
    for k, v in state.items():
        at.session_state[k] = v
    at.run()
    assert not at.exception, at.exception


@pytest.mark.parametrize("market", ["Over / Under", "Favorite vs. Underdog"])
def test_betting_markets(market):
    at = AppTest.from_string(_runner("betting"), default_timeout=60)
    at.session_state["bet_market"] = market
    at.run()
    assert not at.exception, at.exception


def test_app_entry():
    at = AppTest.from_file("../app.py", default_timeout=60)
    at.run()
    assert not at.exception, at.exception


def test_filters_survive_rerun_and_reset():
    """Regression: a range select_slider seeded via session state collapsed to an int on rerun."""
    at = AppTest.from_string(_runner("explorer"), default_timeout=60).run()
    at.select_slider(key="f_seasons").set_range(2022, 2024).run()
    assert at.session_state["f_seasons"] == (2022, 2024)
    at.selectbox(key="gx_ou").select("Over").run()  # unrelated rerun
    assert not at.exception and at.session_state["f_seasons"] == (2022, 2024)
    at.button[0].click().run()  # Reset filters
    assert not at.exception and at.session_state["f_seasons"] == (2020, 2026)


def test_filters_change_numbers():
    """Global filters must flow through to the computed context."""
    at = AppTest.from_string(_runner("overview"), default_timeout=60).run()
    at.select_slider(key="f_seasons").set_range(2023, 2023).run()
    assert not at.exception
    assert "<b>285</b> games" in " ".join(m.value for m in at.markdown)
