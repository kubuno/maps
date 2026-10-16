//! `ResultList` - the list of the places panel (the web's `MapsSearchBar` suggestions and saved places list): a
//! header line, then one row per place with its icon, its name and the rest of its address. Hovering highlights a
//! row, a click picks it (`ItemPicked`, the window flies there), the wheel scrolls. With no row, the empty-state text
//! is shown under the header.

use kubuno_desktop::prelude::MouseEventArgs;
use kubuno_desktop::ui::graphics::{Brush, Font, FontStyle, StringAlignment, StringFormat, StringFormatFlags, StringTrimming};
use kubuno_desktop::ui::{Canvas, Rect, Size};
use kubuno_desktop::views::component::{Control, ControlCore, EventCx, PaintEventCx};
use kubuno_desktop::views::events::Event;

use crate::controls::model::UiPalette;

/// A row was clicked.
#[derive(kubuno_desktop::views::events::EventArgs, Debug, Clone, Default, PartialEq)]
pub struct ItemPickedArgs {
    /// The row's index in the list given to [`ResultList::set_items`].
    pub index: usize,
}

/// One row: a Lucide icon name, the place name and its address.
#[derive(Debug, Clone, PartialEq)]
pub struct ResultRow {
    pub icon: &'static str,
    pub title: String,
    pub detail: String,
}

const ROW_H: f32 = 60.0;
const HDR_H: f32 = 40.0;
/// Scroll per wheel notch, in DIP.
const WHEEL_STEP: f32 = 3.0 * ROW_H / 2.0;

#[derive(kubuno_desktop::views::component::Component, Default)]
#[kubuno(extends = Control, overrides(Control))]
#[category("Maps")]
#[toolbox(icon = "list")]
#[default_event("ItemPicked")]
pub struct ResultList {
    base: ControlCore,
    #[event]
    #[category("Action")]
    pub item_picked: Event<ItemPickedArgs>,
    header: String,
    empty: String,
    rows: Vec<ResultRow>,
    /// The highlighted (picked) row.
    selected: Option<usize>,
    hover: Option<usize>,
    scroll: f32,
}

impl ResultList {
    /// Replace the rows; `header` heads the list, `empty` replaces the rows when there are none.
    pub fn set_items(&mut self, header: impl Into<String>, empty: impl Into<String>, rows: Vec<ResultRow>) {
        self.header = header.into();
        self.empty = empty.into();
        self.rows = rows;
        self.selected = None;
        self.hover = None;
        self.scroll = 0.0;
        self.invalidate();
    }

    /// Highlight a row (or none).
    pub fn set_selected(&mut self, index: Option<usize>) {
        self.selected = index;
        self.invalidate();
    }

    /// The row under a point of the control, if any.
    fn row_at(&self, y: f32) -> Option<usize> {
        if y < HDR_H {
            return None;
        }
        let i = ((y - HDR_H + self.scroll) / ROW_H).floor();
        (i >= 0.0 && (i as usize) < self.rows.len()).then_some(i as usize)
    }

    fn max_scroll(&self) -> f32 {
        (self.rows.len() as f32 * ROW_H - (self.size().height - HDR_H)).max(0.0)
    }
}

impl Control for ResultList {
    fn get_preferred_size(&self, _canvas: &dyn Canvas, proposed: Size) -> Size {
        proposed
    }

    fn on_paint(&mut self, e: &mut PaintEventCx<'_>) {
        let th = UiPalette::current();
        let g = e.graphics;
        let b = e.clip_rectangle;
        g.fill_rectangle(Brush::solid(th.surface), b);
        let near = StringFormat {
            alignment: StringAlignment::Near,
            line_alignment: StringAlignment::Center,
            trimming: StringTrimming::EllipsisCharacter,
            flags: StringFormatFlags::NO_WRAP,
        };
        let f_hdr = Font::with_dip("Segoe UI", 12.0, FontStyle::BOLD);
        let f_title = Font::with_dip("Segoe UI", 14.0, FontStyle::BOLD);
        let f_sub = Font::with_dip("Segoe UI", 12.0, FontStyle::REGULAR);
        g.draw_string(&self.header, &f_hdr, Brush::solid(th.text_secondary), Rect::new(b.left + 16.0, b.top + 8.0, b.right - 16.0, b.top + HDR_H), &near);

        if self.rows.is_empty() {
            let wrap = StringFormat { flags: StringFormatFlags::NONE, ..near };
            g.draw_string(&self.empty, &f_sub, Brush::solid(th.text_tertiary), Rect::new(b.left + 16.0, b.top + HDR_H, b.right - 16.0, b.top + HDR_H + 48.0), &wrap);
            e.raise(self, "OnPaint");
            return;
        }

        let state = g.save();
        g.set_clip(Rect::new(b.left, b.top + HDR_H, b.right, b.bottom));
        let first = (self.scroll / ROW_H).floor() as usize;
        for (i, row) in self.rows.iter().enumerate().skip(first) {
            let y = b.top + HDR_H + i as f32 * ROW_H - self.scroll;
            if y > b.bottom {
                break;
            }
            let r = Rect::new(b.left, y, b.right, y + ROW_H);
            if self.selected == Some(i) {
                g.fill_rectangle(Brush::solid(th.selected), r);
            } else if self.hover == Some(i) {
                g.fill_rectangle(Brush::solid(th.hover), r);
            }
            // The icon in a soft circle.
            let disc = Rect::new(b.left + 16.0, y + ROW_H / 2.0 - 16.0, b.left + 48.0, y + ROW_H / 2.0 + 16.0);
            g.fill_ellipse(Brush::solid(th.hover), disc);
            g.draw_icon(row.icon, disc, 18.0, th.text_secondary);
            g.draw_string(&row.title, &f_title, Brush::solid(th.text_primary), Rect::new(b.left + 60.0, y + 9.0, b.right - 16.0, y + 31.0), &near);
            g.draw_string(&row.detail, &f_sub, Brush::solid(th.text_tertiary), Rect::new(b.left + 60.0, y + 31.0, b.right - 16.0, y + 51.0), &near);
            g.fill_rectangle(Brush::solid(th.border), Rect::new(b.left + 60.0, y + ROW_H - 1.0, b.right, y + ROW_H));
        }
        g.restore(state);
        e.raise(self, "OnPaint");
    }

    fn on_mouse_move(&mut self, e: &mut EventCx<'_, MouseEventArgs>) {
        let hover = self.row_at(e.args().y);
        if hover != self.hover {
            self.hover = hover;
            self.invalidate();
        }
    }

    fn on_mouse_leave(&mut self, _e: &mut EventCx<'_, kubuno_desktop::views::events::EmptyEventArgs>) {
        if self.hover.take().is_some() {
            self.invalidate();
        }
    }

    fn on_mouse_down(&mut self, e: &mut EventCx<'_, MouseEventArgs>) {
        if let Some(index) = self.row_at(e.args().y) {
            self.selected = Some(index);
            self.invalidate();
            self.raise_item_picked(ItemPickedArgs { index });
        }
        e.raise(&*self, "OnMouseDown");
    }

    fn on_mouse_wheel(&mut self, e: &mut EventCx<'_, MouseEventArgs>) {
        let scroll = (self.scroll + e.args().delta * WHEEL_STEP).clamp(0.0, self.max_scroll());
        if scroll != self.scroll {
            self.scroll = scroll;
            self.hover = self.row_at(e.args().y);
            self.invalidate();
        }
    }
}
