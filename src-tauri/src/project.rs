use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rational {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAsset {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: String,
    pub duration_us: i64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub codec: Option<String>,
    pub size_bytes: Option<u64>,
    pub missing: Option<bool>,
    #[serde(default)]
    pub proxy_path: Option<String>,
    #[serde(default)]
    pub proxy_enabled: bool,
    #[serde(default = "default_proxy_status")]
    pub proxy_status: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub has_audio: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keyframe {
    pub id: String,
    pub time_us: i64,
    pub easing: String,
    pub position_x: f32,
    pub position_y: f32,
    pub scale: f32,
    pub rotation: f32,
    pub opacity: f32,
    pub brightness: f32,
    pub contrast: f32,
    pub saturation: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropSettings {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}
impl Default for CropSettings {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaskSettings {
    pub r#type: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub feather: f32,
    pub inverted: bool,
}
impl Default for MaskSettings {
    fn default() -> Self {
        Self {
            r#type: "none".into(),
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
            feather: 0.0,
            inverted: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectInstance {
    pub id: String,
    pub r#type: String,
    pub enabled: bool,
    pub amount: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionSettings {
    pub r#type: String,
    pub duration_us: i64,
}
impl Default for TransitionSettings {
    fn default() -> Self {
        Self {
            r#type: "none".into(),
            duration_us: 0,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedPoint {
    pub id: String,
    pub time_us: i64,
    pub rate: f32,
    pub easing: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChromaKeySettings {
    pub enabled: bool,
    pub key_color: String,
    pub tolerance: f32,
    pub softness: f32,
    pub spill: f32,
    pub opacity: f32,
    pub show_mask: bool,
    pub inverted: bool,
}
impl Default for ChromaKeySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            key_color: "#00ff00".into(),
            tolerance: 0.25,
            softness: 0.08,
            spill: 0.35,
            opacity: 1.0,
            show_mask: false,
            inverted: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackgroundSettings {
    pub enabled: bool,
    pub sampled_color: String,
    pub refinement: f32,
    pub temporal_smoothing: f32,
    pub mode: String,
}
impl Default for AutoBackgroundSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            sampled_color: "#00ff00".into(),
            refinement: 0.3,
            temporal_smoothing: 0.5,
            mode: "fast-local".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedColorSettings {
    pub exposure: f32,
    pub vibrance: f32,
    pub temperature: f32,
    pub tint: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub whites: f32,
    pub blacks: f32,
    pub fade: f32,
}
impl Default for AdvancedColorSettings {
    fn default() -> Self {
        Self {
            exposure: 0.0,
            vibrance: 0.0,
            temperature: 0.0,
            tint: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            whites: 0.0,
            blacks: 0.0,
            fade: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StabilizationSettings {
    pub enabled: bool,
    pub strength: f32,
    pub smoothing: u32,
    pub zoom: f32,
}
impl Default for StabilizationSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            strength: 0.5,
            smoothing: 15,
            zoom: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackingPoint {
    pub time_us: i64,
    pub x: f32,
    pub y: f32,
    pub confidence: f32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionTrackingSettings {
    pub region_x: f32,
    pub region_y: f32,
    pub region_width: f32,
    pub region_height: f32,
    pub points: Vec<TrackingPoint>,
    pub analyzed: bool,
}
impl Default for MotionTrackingSettings {
    fn default() -> Self {
        Self {
            region_x: 0.5,
            region_y: 0.5,
            region_width: 0.2,
            region_height: 0.2,
            points: Vec::new(),
            analyzed: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptionWord {
    pub text: String,
    pub start_us: i64,
    pub end_us: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptionStyle {
    pub font_family: String,
    pub font_size: f32,
    pub font_weight: u32,
    pub color: String,
    pub stroke_color: String,
    pub stroke_width: f32,
    pub background_color: String,
    pub background_opacity: f32,
    pub shadow: bool,
    pub alignment: String,
    pub position_y: f32,
    pub word_highlight_color: String,
}
impl Default for CaptionStyle {
    fn default() -> Self {
        Self {
            font_family: "Arial".into(),
            font_size: 54.0,
            font_weight: 700,
            color: "#ffffff".into(),
            stroke_color: "#000000".into(),
            stroke_width: 3.0,
            background_color: "#000000".into(),
            background_opacity: 0.55,
            shadow: true,
            alignment: "center".into(),
            position_y: 0.82,
            word_highlight_color: "#b9f75a".into(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Caption {
    pub id: String,
    pub start_us: i64,
    pub end_us: i64,
    pub text: String,
    #[serde(default)]
    pub words: Vec<CaptionWord>,
    #[serde(default)]
    pub style: CaptionStyle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub preview_quality: String,
    pub hardware_encoder: String,
    pub transcription_model_path: Option<String>,
}
impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            preview_quality: "full".into(),
            hardware_encoder: "software".into(),
            transcription_model_path: None,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineItem {
    pub id: String,
    pub asset_id: String,
    pub track_id: String,
    pub name: String,
    pub kind: String,
    pub start_us: i64,
    pub duration_us: i64,
    pub source_in_us: i64,
    pub source_out_us: i64,
    pub volume: f32,
    pub opacity: f32,
    #[serde(default)]
    pub position_x: f32,
    #[serde(default)]
    pub position_y: f32,
    #[serde(default = "default_one")]
    pub scale: f32,
    #[serde(default)]
    pub rotation: f32,
    #[serde(default)]
    pub crop: CropSettings,
    #[serde(default)]
    pub flip_horizontal: bool,
    #[serde(default)]
    pub flip_vertical: bool,
    #[serde(default)]
    pub brightness: f32,
    #[serde(default = "default_one")]
    pub contrast: f32,
    #[serde(default = "default_one")]
    pub saturation: f32,
    #[serde(default)]
    pub fade_in_us: i64,
    #[serde(default)]
    pub fade_out_us: i64,
    #[serde(default = "default_one")]
    pub playback_rate: f32,
    #[serde(default)]
    pub reversed: bool,
    #[serde(default)]
    pub freeze_frame_us: Option<i64>,
    #[serde(default = "default_blend_mode")]
    pub blend_mode: String,
    #[serde(default)]
    pub mask: MaskSettings,
    #[serde(default)]
    pub keyframes: Vec<Keyframe>,
    #[serde(default)]
    pub effects: Vec<EffectInstance>,
    #[serde(default)]
    pub transition_in: TransitionSettings,
    #[serde(default)]
    pub transition_out: TransitionSettings,
    #[serde(default)]
    pub speed_points: Vec<SpeedPoint>,
    #[serde(default)]
    pub chroma_key: ChromaKeySettings,
    #[serde(default)]
    pub auto_background: AutoBackgroundSettings,
    #[serde(default)]
    pub advanced_color: AdvancedColorSettings,
    #[serde(default)]
    pub lut_path: Option<String>,
    #[serde(default = "default_one")]
    pub lut_intensity: f32,
    #[serde(default)]
    pub stabilization: StabilizationSettings,
    #[serde(default)]
    pub motion_tracking: MotionTrackingSettings,
    #[serde(default)]
    pub linked_item_ids: Vec<String>,
    #[serde(default)]
    pub compound_sequence_id: Option<String>,
}

fn default_one() -> f32 {
    1.0
}
fn default_blend_mode() -> String {
    "normal".into()
}
fn default_proxy_status() -> String {
    "none".into()
}
fn default_workspace() -> String {
    "video".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub locked: bool,
    pub muted: bool,
    pub visible: bool,
    #[serde(default = "default_one")]
    pub gain: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub solo: bool,
    pub items: Vec<TimelineItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineMarker {
    pub id: String,
    pub time_us: i64,
    pub label: String,
    pub color: String,
    pub kind: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sequence {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub frame_rate: Rational,
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub captions: Vec<Caption>,
    #[serde(default)]
    pub markers: Vec<TimelineMarker>,
    #[serde(default)]
    pub compound: bool,
    #[serde(default)]
    pub parent_sequence_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub modified_at: String,
    pub project_path: Option<String>,
    #[serde(default = "default_workspace")]
    pub workspace: String,
    pub assets: Vec<MediaAsset>,
    #[serde(default)]
    pub favorite_asset_ids: Vec<String>,
    #[serde(default)]
    pub design: Option<serde_json::Value>,
    pub sequence: Sequence,
    #[serde(default)]
    pub sequences: Vec<Sequence>,
    #[serde(default)]
    pub active_sequence_id: String,
    #[serde(default)]
    pub settings: ProjectSettings,
}

impl Project {
    pub fn validate(&self) -> AppResult<()> {
        if self.schema_version != 1 {
            return Err(AppError::InvalidInput(format!(
                "Unsupported project schema {}",
                self.schema_version
            )));
        }
        if self.sequence.width == 0
            || self.sequence.height == 0
            || self.sequence.frame_rate.denominator == 0
        {
            return Err(AppError::InvalidInput(
                "The sequence timebase or dimensions are invalid".into(),
            ));
        }
        if !self.sequences.is_empty() {
            if self.active_sequence_id != self.sequence.id
                || !self
                    .sequences
                    .iter()
                    .any(|sequence| sequence.id == self.sequence.id)
            {
                return Err(AppError::InvalidInput(
                    "The active sequence reference is invalid".into(),
                ));
            }
            let sequence_ids = self
                .sequences
                .iter()
                .map(|sequence| sequence.id.as_str())
                .collect::<Vec<_>>();
            if sequence_ids
                .iter()
                .enumerate()
                .any(|(index, id)| sequence_ids[index + 1..].contains(id))
            {
                return Err(AppError::InvalidInput(
                    "Sequence identifiers must be unique".into(),
                ));
            }
            for sequence in &self.sequences {
                if sequence.width == 0
                    || sequence.height == 0
                    || sequence.frame_rate.denominator == 0
                    || sequence
                        .parent_sequence_id
                        .as_ref()
                        .is_some_and(|parent| !sequence_ids.contains(&parent.as_str()))
                {
                    return Err(AppError::InvalidInput(format!(
                        "Sequence {} has invalid metadata",
                        sequence.name
                    )));
                }
                for track in &sequence.tracks {
                    let compatible = track.items.iter().all(|item| match track.kind.as_str() {
                        "audio" => item.kind == "audio",
                        "graphic" => item.kind == "image",
                        "video" => item.kind != "audio",
                        _ => false,
                    });
                    if !compatible
                        || !track.gain.is_finite()
                        || !(0.0..=2.0).contains(&track.gain)
                        || !track.pan.is_finite()
                        || !(-1.0..=1.0).contains(&track.pan)
                        || track.items.iter().any(|item| {
                            item.compound_sequence_id.as_ref().is_some_and(|compound| {
                                compound == &sequence.id
                                    || !sequence_ids.contains(&compound.as_str())
                            })
                        })
                    {
                        return Err(AppError::InvalidInput(format!(
                            "Sequence {} contains invalid tracks or compound references",
                            sequence.name
                        )));
                    }
                }
            }
        }
        for track in &self.sequence.tracks {
            let kind_ok = matches!(track.kind.as_str(), "video" | "audio" | "graphic" | "text");
            let items_ok = track.items.iter().all(|item| match track.kind.as_str() {
                "audio" => item.kind == "audio",
                "graphic" => item.kind == "image",
                "video" => item.kind != "audio",
                "text" => false,
                _ => false,
            });
            let mix_ok = track.gain.is_finite()
                && (0.0..=2.0).contains(&track.gain)
                && track.pan.is_finite()
                && (-1.0..=1.0).contains(&track.pan);
            if !kind_ok || !items_ok || !mix_ok {
                return Err(AppError::InvalidInput(format!(
                    "Track {} contains incompatible media or mixer values",
                    track.name
                )));
            }
        }
        let item_ids = self
            .sequence
            .tracks
            .iter()
            .flat_map(|track| track.items.iter().map(|item| item.id.as_str()))
            .collect::<Vec<_>>();
        for item in self.sequence.tracks.iter().flat_map(|track| &track.items) {
            if item.start_us < 0
                || item.duration_us <= 0
                || item.source_in_us < 0
                || item.source_out_us <= item.source_in_us
                || !item.volume.is_finite()
                || !(0.0..=1.5).contains(&item.volume)
                || !item.opacity.is_finite()
                || !(0.0..=1.0).contains(&item.opacity)
                || !item.position_x.is_finite()
                || !item.position_y.is_finite()
                || !item.scale.is_finite()
                || !(0.1..=4.0).contains(&item.scale)
                || !item.rotation.is_finite()
                || !item.brightness.is_finite()
                || !(-1.0..=1.0).contains(&item.brightness)
                || !item.contrast.is_finite()
                || !(0.5..=2.0).contains(&item.contrast)
                || !item.saturation.is_finite()
                || !(0.0..=3.0).contains(&item.saturation)
                || item.fade_in_us < 0
                || item.fade_out_us < 0
                || item.fade_in_us + item.fade_out_us > item.duration_us
                || !item.playback_rate.is_finite()
                || !(0.25..=4.0).contains(&item.playback_rate)
                || item
                    .freeze_frame_us
                    .is_some_and(|time| time < item.source_in_us || time > item.source_out_us)
                || !matches!(
                    item.blend_mode.as_str(),
                    "normal" | "multiply" | "screen" | "overlay" | "addition"
                )
                || !matches!(item.mask.r#type.as_str(), "none" | "rectangle" | "ellipse")
                || !item.mask.x.is_finite()
                || !(-1.0..=1.0).contains(&item.mask.x)
                || !item.mask.y.is_finite()
                || !(-1.0..=1.0).contains(&item.mask.y)
                || !item.mask.width.is_finite()
                || !(0.01..=1.0).contains(&item.mask.width)
                || !item.mask.height.is_finite()
                || !(0.01..=1.0).contains(&item.mask.height)
                || !item.mask.feather.is_finite()
                || !(0.0..=1.0).contains(&item.mask.feather)
                || item
                    .keyframes
                    .iter()
                    .any(|frame| !valid_keyframe(frame, item.duration_us))
                || item.effects.iter().any(|effect| !valid_effect(effect))
                || !valid_transition(&item.transition_in, item.duration_us)
                || !valid_transition(&item.transition_out, item.duration_us)
                || item
                    .speed_points
                    .iter()
                    .any(|point| !valid_speed_point(point, item.duration_us))
                || !valid_chroma(&item.chroma_key)
                || !valid_auto_background(&item.auto_background)
                || !valid_advanced_color(&item.advanced_color)
                || !item.lut_intensity.is_finite()
                || !(0.0..=1.0).contains(&item.lut_intensity)
                || !valid_stabilization(&item.stabilization)
                || !valid_motion_tracking(&item.motion_tracking, item.duration_us)
                || item.linked_item_ids.iter().any(|linked_id| {
                    linked_id == &item.id || !item_ids.contains(&linked_id.as_str())
                })
            {
                return Err(AppError::InvalidInput(format!(
                    "Timeline item {} has invalid timing",
                    item.id
                )));
            }
        }
        if !matches!(
            self.settings.preview_quality.as_str(),
            "full" | "half" | "quarter" | "proxy"
        ) || !matches!(
            self.settings.hardware_encoder.as_str(),
            "software" | "h264_nvenc" | "h264_qsv" | "h264_amf"
        ) || self
            .sequence
            .captions
            .iter()
            .any(|caption| !valid_caption(caption))
            || self
                .sequence
                .markers
                .iter()
                .any(|marker| marker.time_us < 0 || marker.label.trim().is_empty())
        {
            return Err(AppError::InvalidInput(
                "Project captions or performance settings are invalid".into(),
            ));
        }
        if !matches!(self.workspace.as_str(), "video" | "design")
            || self
                .favorite_asset_ids
                .iter()
                .any(|id| !self.assets.iter().any(|asset| &asset.id == id))
            || !valid_design(self.design.as_ref())
        {
            return Err(AppError::InvalidInput(
                "The workspace, favorites, or design document is invalid".into(),
            ));
        }
        Ok(())
    }
}

fn valid_design(value: Option<&serde_json::Value>) -> bool {
    let Some(document) = value else { return true };
    let Some(pages) = document.get("pages").and_then(serde_json::Value::as_array) else {
        return false;
    };
    if pages.is_empty() || pages.len() > 200 {
        return false;
    }
    let active = document
        .get("activePageId")
        .and_then(serde_json::Value::as_str);
    if active.is_none()
        || !pages
            .iter()
            .any(|page| page.get("id").and_then(serde_json::Value::as_str) == active)
    {
        return false;
    }
    pages.iter().all(|page| {
        let width = page
            .get("width")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.0);
        let height = page
            .get("height")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.0);
        let Some(objects) = page.get("objects").and_then(serde_json::Value::as_array) else {
            return false;
        };
        (64.0..=16384.0).contains(&width)
            && (64.0..=16384.0).contains(&height)
            && objects.len() <= 5000
            && objects.iter().all(|object| {
                matches!(
                    object.get("type").and_then(serde_json::Value::as_str),
                    Some(
                        "image"
                            | "text"
                            | "rectangle"
                            | "ellipse"
                            | "star"
                            | "arrow"
                            | "path"
                            | "frame"
                    )
                ) && ["x", "y", "width", "height", "rotation", "opacity"]
                    .iter()
                    .all(|key| {
                        object
                            .get(key)
                            .and_then(serde_json::Value::as_f64)
                            .is_some_and(f64::is_finite)
                    })
            })
    })
}

fn valid_speed_point(point: &SpeedPoint, duration_us: i64) -> bool {
    (0..=duration_us).contains(&point.time_us)
        && point.rate.is_finite()
        && (0.25..=4.0).contains(&point.rate)
        && matches!(
            point.easing.as_str(),
            "linear" | "ease-in" | "ease-out" | "ease-in-out"
        )
}
fn valid_chroma(value: &ChromaKeySettings) -> bool {
    valid_color(&value.key_color)
        && [value.tolerance, value.softness, value.spill, value.opacity]
            .iter()
            .all(|number| number.is_finite() && (0.0..=1.0).contains(number))
}
fn valid_auto_background(value: &AutoBackgroundSettings) -> bool {
    valid_color(&value.sampled_color)
        && matches!(value.mode.as_str(), "fast-local" | "semantic-model")
        && [value.refinement, value.temporal_smoothing]
            .iter()
            .all(|number| number.is_finite() && (0.0..=1.0).contains(number))
}
fn valid_advanced_color(value: &AdvancedColorSettings) -> bool {
    value.exposure.is_finite()
        && (-5.0..=5.0).contains(&value.exposure)
        && [
            value.vibrance,
            value.temperature,
            value.tint,
            value.highlights,
            value.shadows,
            value.whites,
            value.blacks,
            value.fade,
        ]
        .iter()
        .all(|number| number.is_finite() && (-1.0..=1.0).contains(number))
}
fn valid_stabilization(value: &StabilizationSettings) -> bool {
    value.strength.is_finite()
        && (0.0..=1.0).contains(&value.strength)
        && (1..=100).contains(&value.smoothing)
        && value.zoom.is_finite()
        && (0.0..=30.0).contains(&value.zoom)
}
fn valid_motion_tracking(value: &MotionTrackingSettings, duration_us: i64) -> bool {
    [
        value.region_x,
        value.region_y,
        value.region_width,
        value.region_height,
    ]
    .iter()
    .all(|number| number.is_finite() && (0.0..=1.0).contains(number))
        && value.points.iter().all(|point| {
            (0..=duration_us).contains(&point.time_us)
                && point.x.is_finite()
                && point.y.is_finite()
                && point.confidence.is_finite()
                && (0.0..=1.0).contains(&point.confidence)
        })
}
fn valid_caption(value: &Caption) -> bool {
    value.start_us >= 0
        && value.end_us > value.start_us
        && !value.text.trim().is_empty()
        && valid_color(&value.style.color)
        && valid_color(&value.style.stroke_color)
        && valid_color(&value.style.background_color)
        && valid_color(&value.style.word_highlight_color)
        && value.style.font_size.is_finite()
        && (8.0..=300.0).contains(&value.style.font_size)
        && value.style.stroke_width.is_finite()
        && (0.0..=20.0).contains(&value.style.stroke_width)
        && value.style.background_opacity.is_finite()
        && (0.0..=1.0).contains(&value.style.background_opacity)
        && value.style.position_y.is_finite()
        && (0.0..=1.0).contains(&value.style.position_y)
        && matches!(value.style.alignment.as_str(), "left" | "center" | "right")
        && value.words.iter().all(|word| {
            word.start_us >= value.start_us
                && word.end_us > word.start_us
                && word.end_us <= value.end_us
        })
}
fn valid_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}
fn valid_keyframe(frame: &Keyframe, duration_us: i64) -> bool {
    (0..=duration_us).contains(&frame.time_us)
        && matches!(
            frame.easing.as_str(),
            "linear" | "ease-in" | "ease-out" | "ease-in-out"
        )
        && [
            frame.position_x,
            frame.position_y,
            frame.scale,
            frame.rotation,
            frame.opacity,
            frame.brightness,
            frame.contrast,
            frame.saturation,
        ]
        .iter()
        .all(|value| value.is_finite())
        && (0.1..=4.0).contains(&frame.scale)
        && (0.0..=1.0).contains(&frame.opacity)
        && (-1.0..=1.0).contains(&frame.brightness)
        && (0.5..=2.0).contains(&frame.contrast)
        && (0.0..=3.0).contains(&frame.saturation)
}
fn valid_effect(effect: &EffectInstance) -> bool {
    matches!(
        effect.r#type.as_str(),
        "blur" | "sharpen" | "grayscale" | "vignette"
    ) && effect.amount.is_finite()
        && (0.0..=1.0).contains(&effect.amount)
}
fn valid_transition(transition: &TransitionSettings, duration_us: i64) -> bool {
    matches!(
        transition.r#type.as_str(),
        "none" | "fade" | "wipe-left" | "slide-left"
    ) && (0..=duration_us / 2).contains(&transition.duration_us)
}
#[tauri::command]
pub fn save_project(path: String, project: Project) -> AppResult<()> {
    project.validate()?;
    let target = checked_project_path(&path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = target.with_extension("ofp.tmp");
    let backup = target.with_extension("ofp.bak");
    let bytes = serde_json::to_vec_pretty(&project)?;
    {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
    }
    if target.exists() {
        if backup.exists() {
            fs::remove_file(&backup)?;
        }
        fs::rename(&target, &backup)?;
    }
    if let Err(error) = fs::rename(&temporary, &target) {
        if backup.exists() {
            let _ = fs::rename(&backup, &target);
        }
        return Err(error.into());
    }
    if backup.exists() {
        fs::remove_file(backup)?;
    }
    Ok(())
}

#[tauri::command]
pub fn load_project(path: String, app: tauri::AppHandle) -> AppResult<Project> {
    let target = checked_project_path(&path)?;
    let mut project: Project = serde_json::from_slice(&fs::read(&target)?)?;
    project.validate()?;
    project.project_path = Some(target.to_string_lossy().into_owned());
    for asset in &mut project.assets {
        let source = Path::new(&asset.path);
        let missing = !source.exists();
        asset.missing = Some(missing);
        if !missing {
            app.asset_protocol_scope()
                .allow_file(source)
                .map_err(|error| {
                    AppError::Media(format!("Could not authorize media preview: {error}"))
                })?;
        }
    }
    Ok(project)
}

fn recovery_directory(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Io(std::io::Error::other(error)))?
        .join("recovery");
    fs::create_dir_all(&directory)?;
    Ok(directory)
}

fn recovery_path(app: &tauri::AppHandle, project_id: &str) -> AppResult<PathBuf> {
    if project_id.is_empty()
        || project_id.len() > 160
        || !project_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(AppError::InvalidInput("Invalid recovery project id".into()));
    }
    Ok(recovery_directory(app)?.join(format!("{project_id}.recovery.ofp")))
}

#[tauri::command]
pub fn autosave_project(project: Project, app: tauri::AppHandle) -> AppResult<()> {
    project.validate()?;
    let target = recovery_path(&app, &project.id)?;
    let temporary = target.with_extension("ofp.tmp");
    let bytes = serde_json::to_vec_pretty(&project)?;
    {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
    }
    if target.exists() {
        fs::remove_file(&target)?;
    }
    fs::rename(temporary, target)?;
    Ok(())
}

#[tauri::command]
pub fn list_recoveries(app: tauri::AppHandle) -> AppResult<Vec<Project>> {
    let mut projects = Vec::new();
    for entry in fs::read_dir(recovery_directory(&app)?)? {
        let path = entry?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("ofp") {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else { continue };
        let Ok(mut project) = serde_json::from_slice::<Project>(&bytes) else {
            continue;
        };
        if project.validate().is_err() {
            continue;
        }
        for asset in &mut project.assets {
            let source = Path::new(&asset.path);
            asset.missing = Some(!source.exists());
            if source.exists() {
                let _ = app.asset_protocol_scope().allow_file(source);
            }
        }
        projects.push(project);
    }
    projects.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    Ok(projects)
}

#[tauri::command]
pub fn discard_recovery(project_id: String, app: tauri::AppHandle) -> AppResult<()> {
    let path = recovery_path(&app, &project_id)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
fn checked_project_path(path: &str) -> AppResult<PathBuf> {
    let target = PathBuf::from(path);
    if target
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("ofp"))
        != Some(true)
    {
        return Err(AppError::InvalidInput(
            "OpenFrame projects must use the .ofp extension".into(),
        ));
    }
    Ok(target)
}
