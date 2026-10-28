"""Plotly chart builders with consistent formatting and hover details."""
from __future__ import annotations

from typing import Sequence

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from nfl_edge.ui import theme as T

Series = tuple[str, str, str]  # (column, display name, color)

CONFIG = {"displayModeBar": False, "responsive": True}


def show(fig: go.Figure, height: int = 330, key: str | None = None) -> None:
    fig.update_layout(height=height)
    st.plotly_chart(fig, width="stretch", config=CONFIG, key=key)


def _yfmt(fig: go.Figure, kind: str, title: str = "") -> None:
    if kind == "pct":
        fig.update_yaxes(tickformat=".0%", title=title)
    elif kind == "pct1":
        fig.update_yaxes(tickformat=".1%", title=title)
    else:
        fig.update_yaxes(title=title)


def _x_axis(fig: go.Figure, x_title: str, categorical: bool = True) -> None:
    fig.update_xaxes(title=x_title, type="category" if categorical else None)


def _hv(kind: str) -> str:
    if kind == "pct1":
        return "%{y:.2%}"
    return "%{y:.1%}" if kind == "pct" else "%{y:.1f}"


def ref_line(fig: go.Figure, y: float, label: str = "", color: str = T.MUTED, horizontal: bool = True) -> None:
    kw = dict(line=dict(color=color, width=1, dash="dot"))
    if horizontal:
        fig.add_hline(y=y, annotation_text=label, annotation_position="top left",
                      annotation_font=dict(size=10, color=T.MUTED), **kw)
    else:
        fig.add_vline(x=y, annotation_text=label, annotation_font=dict(size=10, color=T.MUTED), **kw)


def trend(
    df: pd.DataFrame, x: str, series: Sequence[Series], title: str, kind: str = "num",
    y_title: str = "", x_title: str = "", n_col: str | None = None, ref: float | None = None,
    ref_label: str = "", fill_band: tuple[str, str] | None = None,
) -> go.Figure:
    fig = go.Figure()
    n = df[n_col] if n_col else None
    for col, name, color in series:
        cd = np.stack([n], axis=-1) if n is not None else None
        extra = "<br>Games: %{customdata[0]:,}" if n is not None else ""
        fig.add_trace(
            go.Scatter(
                x=df[x].astype(str), y=df[col], name=name, mode="lines+markers",
                line=dict(color=color, width=2), marker=dict(size=7, color=color, line=dict(width=1.5, color=T.SURFACE)),
                customdata=cd,
                hovertemplate=f"<b>{name}</b><br>{x_title or x.title()}: %{{x}}<br>{_hv(kind)}{extra}<extra></extra>",
            )
        )
    if ref is not None:
        ref_line(fig, ref, ref_label)
    fig.update_layout(title=title, hovermode="x unified" if len(series) > 1 else "closest")
    if len(series) > 1:
        # unified hover shows one header; keep per-series lines short
        for tr in fig.data:
            tr.hovertemplate = f"{tr.name}: {_hv(kind)}" + ("  (n=%{customdata[0]:,})" if n is not None else "") + "<extra></extra>"
    else:
        fig.update_layout(showlegend=False)
    _yfmt(fig, kind, y_title)
    _x_axis(fig, x_title)
    return fig


def bars(
    df: pd.DataFrame, x: str, series: Sequence[Series], title: str, kind: str = "num",
    y_title: str = "", x_title: str = "", n_col: str | None = None, ref: float | None = None,
    ref_label: str = "", text: bool = True, barmode: str = "group", horizontal: bool = False,
    hover_extra: str | None = None,
) -> go.Figure:
    fig = go.Figure()
    for col, name, color in series:
        cd_cols = [c for c in (n_col, hover_extra) if c]
        cd = df[cd_cols].to_numpy() if cd_cols else None
        extra = ""
        if n_col:
            extra += "<br>Games: %{customdata[0]:,}"
        if hover_extra:
            extra += f"<br>%{{customdata[{1 if n_col else 0}]}}"
        val = "%{x:.1%}" if (kind == "pct" and horizontal) else ("%{x:.1f}" if horizontal else _hv(kind))
        cat = "%{y}" if horizontal else "%{x}"
        txt = None
        if text:
            vals = df[col]
            txt = [("" if pd.isna(v) else (f"{v:.0%}" if kind == "pct" else f"{v:.1f}")) for v in vals]
        common = dict(
            name=name, marker=dict(color=color, cornerradius=3), customdata=cd, text=txt,
            textposition="outside", textfont=dict(size=10, color=T.TEXT_2), cliponaxis=False,
            hovertemplate=f"<b>{name}</b><br>{cat}<br>{val}{extra}<extra></extra>",
        )
        if horizontal:
            fig.add_trace(go.Bar(y=df[x].astype(str), x=df[col], orientation="h", **common))
        else:
            fig.add_trace(go.Bar(x=df[x].astype(str), y=df[col], **common))
    if ref is not None:
        ref_line(fig, ref, ref_label, horizontal=not horizontal)
    fig.update_layout(title=title, barmode=barmode, showlegend=len(series) > 1)
    if horizontal:
        if kind == "pct":
            fig.update_xaxes(tickformat=".0%", title=y_title, showgrid=True)
        else:
            fig.update_xaxes(title=y_title, showgrid=True)
        fig.update_yaxes(title=x_title, type="category", autorange="reversed")
    else:
        _yfmt(fig, kind, y_title)
        _x_axis(fig, x_title)
    return fig


def outcome_stack(
    df: pd.DataFrame, x: str, parts: Sequence[Series], title: str, x_title: str = "", pct: bool = True,
) -> go.Figure:
    """100%-stacked (or count-stacked) outcome bars, e.g. Cover / Push / No Cover."""
    fig = go.Figure()
    total = df[[c for c, _, _ in parts]].sum(axis=1).replace(0, np.nan)
    for col, name, color in parts:
        y = df[col] / total if pct else df[col]
        fig.add_trace(
            go.Bar(
                x=df[x].astype(str), y=y, name=name, marker=dict(color=color, line=dict(color=T.SURFACE, width=1.5)),
                customdata=np.stack([df[col], total], axis=-1),
                hovertemplate=f"<b>{name}</b><br>%{{x}}<br>%{{customdata[0]:,.0f}} of %{{customdata[1]:,.0f}} graded"
                + (" (%{y:.1%})" if pct else "") + "<extra></extra>",
            )
        )
    fig.update_layout(title=title, barmode="stack", legend=dict(traceorder="normal"))
    if pct:
        fig.update_yaxes(tickformat=".0%", range=[0, 1])
    _x_axis(fig, x_title)
    return fig


def price_bars(values: pd.Series, title: str, highlight: Sequence[int] = ()) -> go.Figure:
    """Counts of American-odds prices on a categorical axis ordered by implied probability,
    so the -100/+100 discontinuity does not create an empty gap."""
    v = values.dropna().astype(int)
    counts = v.value_counts()
    prob = pd.Series(np.where(counts.index < 0, -counts.index / (-counts.index + 100), 100 / (counts.index + 100)),
                     index=counts.index)
    order = prob.sort_values(ascending=False).index
    counts = counts.loc[order]
    share = counts / counts.sum()
    fig = go.Figure(go.Bar(
        x=[f"{p:+d}" for p in counts.index], y=counts.values, customdata=share.values,
        marker=dict(color=[T.ORANGE if p in highlight else T.BLUE for p in counts.index], cornerradius=2),
        hovertemplate="Price %{x}<br>Sides: %{y:,}<br>Share: %{customdata:.1%}<extra></extra>"))
    fig.update_layout(title=title, bargap=0.15, showlegend=False)
    fig.update_xaxes(type="category", title="American odds (shorter → longer)", tickangle=-45, tickfont=dict(size=9))
    fig.update_yaxes(title="Sides")
    return fig


def histogram(
    values: pd.Series, title: str, x_title: str, color: str = T.BLUE, highlight: Sequence[int] = (),
    bin_size: float = 1, x_range: tuple[float, float] | None = None,
) -> go.Figure:
    v = values.dropna()
    counts = v.value_counts().sort_index()
    if bin_size != 1:
        b = (np.floor(v / bin_size) * bin_size)
        counts = b.value_counts().sort_index()
    share = counts / counts.sum()
    colors = [T.ORANGE if x in highlight else color for x in counts.index]
    fig = go.Figure(
        go.Bar(
            x=counts.index, y=counts.values, marker=dict(color=colors, cornerradius=2),
            customdata=share.values,
            hovertemplate=f"{x_title}: %{{x}}<br>Games: %{{y:,}}<br>Share: %{{customdata:.1%}}<extra></extra>",
        )
    )
    fig.update_layout(title=title, bargap=0.12, showlegend=False)
    fig.update_xaxes(title=x_title, range=x_range)
    fig.update_yaxes(title="Games")
    return fig


def scatter_line_vs_actual(
    df: pd.DataFrame, x: str, y: str, color_col: str, color_map: dict, title: str,
    x_title: str, y_title: str, hover: str, diag: bool = True, zero_lines: bool = False,
) -> go.Figure:
    fig = go.Figure()
    for k, c in color_map.items():
        d = df[df[color_col] == k]
        if d.empty:
            continue
        fig.add_trace(
            go.Scattergl(
                x=d[x], y=d[y], mode="markers", name=f"{k} ({len(d):,})",
                marker=dict(size=7, color=c, opacity=0.65, line=dict(width=0.5, color=T.BG)),
                text=d[hover],
                hovertemplate=f"%{{text}}<br>{x_title}: %{{x}}<br>{y_title}: %{{y}}<extra>{k}</extra>",
            )
        )
    if diag:
        lo = float(min(df[x].min(), df[y].min()))
        hi = float(max(df[x].max(), df[y].max()))
        fig.add_trace(go.Scatter(x=[lo, hi], y=[lo, hi], mode="lines", name="Line = actual",
                                 line=dict(color=T.MUTED, dash="dot", width=1), hoverinfo="skip"))
    if zero_lines:
        fig.add_hline(y=0, line=dict(color=T.BORDER, width=1))
        fig.add_vline(x=0, line=dict(color=T.BORDER, width=1))
    fig.update_layout(title=title)
    fig.update_xaxes(title=x_title, showgrid=True, gridcolor=T.GRID)
    fig.update_yaxes(title=y_title)
    return fig


def diverging_team_bars(df: pd.DataFrame, team_col: str, val_col: str, title: str, n_col: str,
                        center: float = 0.5, rec_col: str | None = None) -> go.Figure:
    d = df.sort_values(val_col, ascending=True)
    colors = [T.GREEN if v >= center else T.RED for v in d[val_col]]
    # bars grow from the center line; hover shows the real value, not the delta
    cd = np.column_stack(
        [d[val_col].map(lambda v: f"{v:.1%}"), d[n_col]] + ([d[rec_col]] if rec_col else [])
    )
    fig = go.Figure(
        go.Bar(
            y=d[team_col], x=d[val_col] - center, base=center, orientation="h",
            marker=dict(color=colors, cornerradius=2), customdata=cd,
            hovertemplate="<b>%{y}</b><br>%{customdata[0]}"
            + ("<br>Record: %{customdata[2]}" if rec_col else "")
            + "<br>Graded games: %{customdata[1]}<extra></extra>",
        )
    )
    fig.add_vline(x=center, line=dict(color=T.MUTED, width=1, dash="dot"))
    fig.update_layout(title=title, showlegend=False, bargap=0.18)
    fig.update_xaxes(tickformat=".0%", showgrid=True, gridcolor=T.GRID)
    fig.update_yaxes(type="category", tickfont=dict(size=10))
    return fig
