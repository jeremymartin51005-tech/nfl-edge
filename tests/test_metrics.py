"""Calculation checks: settlement logic on synthetic games, and full-dataset
recomputation from the raw CSV using an independent, row-by-row implementation."""
import numpy as np
import pandas as pd
import pytest

from nfl_edge import metrics as m
from nfl_edge.cleaning import build_games, build_team_games
from nfl_edge.loader import read_games


def _raw(rows):
    base = dict(season=2023, game_type="REG", week=1, gameday="2023-09-10", weekday="Sunday", gametime="13:00",
                location="Home", overtime=0, home_spread_odds=-110, away_spread_odds=-110, over_odds=-110,
                under_odds=-110, div_game=0, roof="outdoors", surface="grass", temp=60, wind=5, stadium="X",
                home_qb_name="a", away_qb_name="b", home_coach="c", away_coach="d", referee="r")
    out = []
    for i, r in enumerate(rows):
        d = {**base, **r}
        d.setdefault("game_id", f"g{i}")
        d.setdefault("gameday", f"2023-09-{10 + i}")
        out.append(d)
    return pd.DataFrame(out)


@pytest.fixture
def synthetic():
    raw = _raw([
        # home fav by 3, wins by 7 -> home covers, fav covers, 44 vs 45.5 under
        dict(home_team="AAA", away_team="BBB", home_score=24, away_score=17, spread_line=3, total_line=45.5,
             home_moneyline=-160, away_moneyline=140),
        # away fav by 7 (spread_line -7), away wins by 7 -> push; 48 vs 48 push
        dict(home_team="CCC", away_team="DDD", home_score=20, away_score=27, spread_line=-7, total_line=47,
             home_moneyline=260, away_moneyline=-320),
        # home dog +2.5 loses by 1 -> home covers, favorite (away) wins SU but fails ATS; 41 > 40 over
        dict(home_team="EEE", away_team="FFF", home_score=20, away_score=21, spread_line=-2.5, total_line=40,
             home_moneyline=120, away_moneyline=-140),
        # pick'em with ML favorite away; tie game
        dict(home_team="GGG", away_team="HHH", home_score=20, away_score=20, spread_line=0, total_line=40,
             home_moneyline=105, away_moneyline=-125),
        # unplayed game must be excluded
        dict(home_team="AAA", away_team="CCC", home_score=np.nan, away_score=np.nan, spread_line=1, total_line=44,
             home_moneyline=-115, away_moneyline=-105),
        # neutral site
        dict(home_team="BBB", away_team="DDD", home_score=10, away_score=30, spread_line=1.5, total_line=42,
             home_moneyline=-125, away_moneyline=105, location="Neutral"),
    ])
    raw.loc[3, "total_line"] = 40  # 40 total -> push
    g, rep = build_games(raw)
    return g, build_team_games(g), rep


def test_settlement(synthetic):
    g, tg, rep = synthetic
    assert rep.unplayed_excluded == 1 and len(g) == 5
    r = g.set_index("home_team")
    assert r.loc["AAA", "home_ats"] == "Cover" and r.loc["AAA", "fav_ats"] == "Cover"
    assert r.loc["AAA", "favorite"] == "AAA" and r.loc["AAA", "ou_result"] == "Under"
    assert r.loc["CCC", "favorite"] == "DDD" and r.loc["CCC", "fav_ats"] == "Push" and r.loc["CCC", "home_ats"] == "Push"


def test_settlement_precise(synthetic):
    g, tg, _ = synthetic
    r = g.set_index("home_team")
    assert r.loc["CCC", "total_pts"] == 47 and r.loc["CCC", "ou_result"] == "Push"
    assert r.loc["EEE", "favorite"] == "FFF" and r.loc["EEE", "fav_su"] == "W" and r.loc["EEE", "fav_ats"] == "No Cover"
    assert r.loc["EEE", "home_ats"] == "Cover" and r.loc["EEE", "ou_result"] == "Over"
    assert r.loc["GGG", "favorite"] == "HHH" and r.loc["GGG", "fav_basis"] == "moneyline"
    assert r.loc["GGG", "winner"] == "TIE" and r.loc["GGG", "home_ats"] == "Push" and r.loc["GGG", "ou_result"] == "Push"
    assert bool(r.loc["BBB", "neutral_site"])


def test_team_perspective(synthetic):
    g, tg, _ = synthetic
    t = tg.set_index(["game_id", "team"])
    # away favorite DDD -7 wins by 7 -> push for both teams
    gid = g.loc[g["home_team"] == "CCC", "game_id"].iloc[0]
    assert t.loc[(gid, "DDD"), "team_line"] == -7 and t.loc[(gid, "DDD"), "ats"] == "Push"
    assert t.loc[(gid, "CCC"), "team_line"] == 7 and t.loc[(gid, "CCC"), "role"] == "Underdog"
    gid = g.loc[g["home_team"] == "EEE", "game_id"].iloc[0]
    assert t.loc[(gid, "FFF"), "ats"] == "No Cover" and t.loc[(gid, "EEE"), "ats"] == "Cover"
    gid = g.loc[g["home_team"] == "BBB", "game_id"].iloc[0]
    assert (t.loc[gid, "venue"] == "Neutral").all()


def test_rate_definitions():
    s = pd.Series(["Cover"] * 6 + ["No Cover"] * 4 + ["Push"] * 2 + [None])
    r = m.ats(s)
    assert r.pct == pytest.approx(0.6) and r.push_pct == pytest.approx(2 / 12)
    w = m.su(pd.Series(["W", "W", "L", "T"]))
    assert w.pct == pytest.approx(0.5) and w.record == "2-1-1"
    assert np.isnan(m.ats(pd.Series([], dtype=object)).pct)


# --- full dataset, independent recomputation ---------------------------------

@pytest.fixture(scope="module")
def real():
    raw = read_games()
    g, rep = build_games(raw)
    return raw, g, build_team_games(g), rep


def _naive(raw):
    d = raw[(raw.season >= 2020) & raw.home_score.notna()]
    rows = []
    for r in d.itertuples():
        home_ats = r.home_score - r.away_score - r.spread_line
        ou = r.home_score + r.away_score - r.total_line
        rows.append((r.game_id, r.home_team, r.away_team, np.sign(home_ats), np.sign(ou),
                     r.home_score, r.away_score, r.spread_line, r.location))
    return pd.DataFrame(rows, columns=["gid", "h", "a", "ats", "ou", "hs", "as_", "sl", "loc"])


def test_no_duplicates(real):
    _, g, _, rep = real
    assert g["game_id"].is_unique
    assert not g.duplicated(["date", "home_team", "away_team"]).any()


def test_league_counts_match_raw(real):
    raw, g, tg, _ = real
    n = _naive(raw)
    assert len(n) == len(g)
    h = m.ats(g["home_ats"])
    assert (h.win, h.loss, h.push) == ((n.ats > 0).sum(), (n.ats < 0).sum(), (n.ats == 0).sum())
    o = m.ou(g["ou_result"])
    assert (o.win, o.loss, o.push) == ((n.ou > 0).sum(), (n.ou < 0).sum(), (n.ou == 0).sum())
    nn = n[n["loc"] != "Neutral"]
    home_wins = (nn.hs > nn.as_).sum()
    assert m.su(g.loc[~g.neutral_site, "home_su"]).w == home_wins


def test_team_ats_matches_raw(real):
    raw, g, tg, _ = real
    n = _naive(raw)
    tt = m.team_table(tg).set_index("team")
    for team in ["KC", "DET", "NYJ", "SF"]:
        covers = ((n.h == team) & (n.ats > 0)).sum() + ((n.a == team) & (n.ats < 0)).sum()
        pushes = (((n.h == team) | (n.a == team)) & (n.ats == 0)).sum()
        games = ((n.h == team) | (n.a == team)).sum()
        assert tt.loc[team, "ats_cover"] == covers
        assert tt.loc[team, "ats_push"] == pushes
        assert tt.loc[team, "games"] == games
        pf = n.loc[n.h == team, "hs"].sum() + n.loc[n.a == team, "as_"].sum()
        assert tt.loc[team, "ppg"] == pytest.approx(pf / games)


def test_team_perspective_symmetry(real):
    _, g, tg, _ = real
    a = m.ats(tg["ats"])
    assert a.win == a.loss and a.push == 2 * m.ats(g["home_ats"]).push
    s = m.su(tg["su"])
    assert s.w == s.l


def test_favorite_consistent_with_moneyline(real):
    _, g, _, _ = real
    d = g[g["home_ml"].notna() & (g["home_ml"] != g["away_ml"])]
    ml_fav = np.where(d["home_ml"] < d["away_ml"], d["home_team"], d["away_team"])
    agree = (ml_fav == d["favorite"]).mean()
    assert agree > 0.99  # spread and moneyline favorites agree (sanity on spread sign convention)
