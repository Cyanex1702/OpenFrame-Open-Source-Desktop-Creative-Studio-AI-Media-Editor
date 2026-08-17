use crate::{
    error::{AppError, AppResult},
    media::{hidden_command, media_binary, probe},
    plugins::{resolve_exporter, ExporterContribution},
    project::{Caption, EffectInstance, Keyframe, MediaAsset, Project, TimelineItem},
};
use std::path::Path;

#[tauri::command]
pub async fn export_project(
    project: Project,
    output_path: String,
    app: tauri::AppHandle,
) -> AppResult<String> {
    project.validate()?;
    let returned_path = output_path.clone();
    let ffmpeg = media_binary(&app, "ffmpeg");
    let ffprobe = media_binary(&app, "ffprobe");
    tauri::async_runtime::spawn_blocking(move || {
        export(&project, Path::new(&output_path), &ffmpeg, &ffprobe, None)
    })
    .await
    .map_err(|error| AppError::Media(error.to_string()))??;
    Ok(returned_path)
}

#[tauri::command]
pub async fn export_project_with_plugin(
    project: Project,
    output_path: String,
    plugin_id: String,
    exporter_id: String,
    app: tauri::AppHandle,
) -> AppResult<String> {
    project.validate()?;
    let preset = resolve_exporter(&app, &plugin_id, &exporter_id)?;
    let returned_path = output_path.clone();
    let ffmpeg = media_binary(&app, "ffmpeg");
    let ffprobe = media_binary(&app, "ffprobe");
    tauri::async_runtime::spawn_blocking(move || {
        export(
            &project,
            Path::new(&output_path),
            &ffmpeg,
            &ffprobe,
            Some(&preset),
        )
    })
    .await
    .map_err(|error| AppError::Media(error.to_string()))??;
    Ok(returned_path)
}
struct Source<'a> {
    item: &'a TimelineItem,
    asset: &'a MediaAsset,
    input: usize,
    visual: bool,
    audio_enabled: bool,
    track_gain: f32,
    track_pan: f32,
}

struct RenderContext {
    width: u32,
    height: u32,
    fps: f64,
    duration: f64,
}

fn export(
    project: &Project,
    output: &Path,
    ffmpeg: &Path,
    ffprobe: &Path,
    preset: Option<&ExporterContribution>,
) -> AppResult<()> {
    if output
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("mp4"))
        != Some(true)
    {
        return Err(AppError::InvalidInput(
            "OpenFrame exports must use the .mp4 extension".into(),
        ));
    }
    let fps = project.sequence.frame_rate.numerator as f64
        / project.sequence.frame_rate.denominator as f64;
    let duration_us = project
        .sequence
        .tracks
        .iter()
        .flat_map(|track| &track.items)
        .map(|item| item.start_us + item.duration_us)
        .max()
        .unwrap_or(0);
    if duration_us <= 0 {
        return Err(AppError::InvalidInput(
            "Add at least one timeline clip before exporting".into(),
        ));
    }
    let context = RenderContext {
        width: project.sequence.width,
        height: project.sequence.height,
        fps,
        duration: duration_us as f64 / 1_000_000.0,
    };
    let has_solo = project
        .sequence
        .tracks
        .iter()
        .any(|track| track.solo && !track.muted && track.kind != "graphic");
    let mut sources = Vec::new();
    for track in project
        .sequence
        .tracks
        .iter()
        .rev()
        .filter(|track| (track.kind == "video" || track.kind == "graphic") && track.visible)
    {
        for item in &track.items {
            if item.kind == "audio" {
                continue;
            }
            let asset = project
                .assets
                .iter()
                .find(|asset| asset.id == item.asset_id)
                .ok_or_else(|| {
                    AppError::InvalidInput(format!("Missing asset for {}", item.name))
                })?;
            let has_audio =
                asset.kind != "image" && probe(Path::new(&asset.path), ffprobe)?.has_audio;
            sources.push(Source {
                item,
                asset,
                input: sources.len(),
                visual: true,
                audio_enabled: has_audio && !track.muted && (!has_solo || track.solo),
                track_gain: track.gain,
                track_pan: track.pan,
            });
        }
    }
    let visual_count = sources.len();
    if visual_count == 0 {
        return Err(AppError::InvalidInput(
            "Add at least one video or image clip before exporting".into(),
        ));
    }
    for track in project
        .sequence
        .tracks
        .iter()
        .filter(|track| track.kind == "audio" && !track.muted && (!has_solo || track.solo))
    {
        for item in &track.items {
            let asset = project
                .assets
                .iter()
                .find(|asset| asset.id == item.asset_id)
                .ok_or_else(|| {
                    AppError::InvalidInput(format!("Missing asset for {}", item.name))
                })?;
            let has_audio = probe(Path::new(&asset.path), ffprobe)?.has_audio;
            sources.push(Source {
                item,
                asset,
                input: sources.len(),
                visual: false,
                audio_enabled: has_audio,
                track_gain: track.gain,
                track_pan: track.pan,
            });
        }
    }

    let filter = compositor_filter(&sources, &context, &project.sequence.captions);
    let crf = preset.map(|value| value.crf).unwrap_or(18);
    let audio_bitrate = preset.map(|value| value.audio_bitrate_kbps).unwrap_or(192);

    let run = |encoder: &str| {
        let mut command = hidden_command(ffmpeg);
        command.arg("-y");
        for source in &sources {
            if source.asset.kind == "image" {
                command.args(["-loop", "1", "-framerate", &format!("{fps:.6}")]);
            }
            command.arg("-i").arg(Path::new(&source.asset.path));
        }
        command.args([
            "-filter_complex",
            &filter,
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-t",
            &format!("{:.6}", context.duration),
            "-c:v",
            encoder,
        ]);
        if encoder == "libx264" {
            command.args(["-preset", "medium", "-crf", &crf.to_string()]);
        } else {
            command.args(["-preset", "medium", "-b:v", "0"]);
        }
        command
            .args([
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                &format!("{audio_bitrate}k"),
                "-ar",
                "48000",
                "-ac",
                "2",
                "-movflags",
                "+faststart",
            ])
            .arg(output)
            .output()
            .map_err(|_| AppError::MissingFfmpeg)
    };
    let requested = if project.settings.hardware_encoder == "software" {
        "libx264"
    } else {
        project.settings.hardware_encoder.as_str()
    };
    let first = run(requested)?;
    if first.status.success() {
        Ok(())
    } else if requested != "libx264" {
        check_ffmpeg(run("libx264")?)
    } else {
        check_ffmpeg(first)
    }
}

fn compositor_filter(
    sources: &[Source<'_>],
    context: &RenderContext,
    captions: &[Caption],
) -> String {
    let mut parts = vec![format!(
        "color=c=black:s={}x{}:r={:0.6}:d={:0.6},format=rgba[base]",
        context.width, context.height, context.fps, context.duration
    )];
    let mut previous = "base".to_owned();
    for (visual_index, source) in sources.iter().filter(|source| source.visual).enumerate() {
        let foreground = format!("fg{visual_index}");
        parts.push(video_chain(source, context, &foreground));
        let composed = format!("comp{visual_index}");
        let x = overlay_x(source.item, context);
        let local_time = format!("(t-{:.6})", source.item.start_us as f64 / 1_000_000.0);
        let y = format!(
            "(H-h)/2+{}",
            animation_expression_at(
                source.item,
                Property::PositionY,
                source.item.position_y,
                &local_time
            ) + &tracking_expression(source.item, &local_time, false)
        );
        if source.item.blend_mode == "normal" {
            parts.push(format!("[{previous}][{foreground}]overlay=x='{x}':y='{y}':eof_action=pass:format=auto[{composed}]"));
        } else {
            let layer = format!("layer{visual_index}");
            let clear = format!("clear{visual_index}");
            parts.push(format!(
                "color=c=black@0:s={}x{}:r={:0.6}:d={:0.6},format=rgba[{clear}]",
                context.width, context.height, context.fps, context.duration
            ));
            parts.push(format!("[{clear}][{foreground}]overlay=x='{x}':y='{y}':eof_action=pass:format=auto[{layer}]"));
            let mode = if source.item.blend_mode == "addition" {
                "addition"
            } else {
                source.item.blend_mode.as_str()
            };
            parts.push(format!(
                "[{previous}][{layer}]blend=all_mode={mode}:all_opacity=1[{composed}]"
            ));
        }
        previous = composed;
    }
    let mut final_filters = vec![format!("fps={:.6}", context.fps)];
    final_filters.extend(captions.iter().map(caption_filter));
    final_filters.push("format=yuv420p".into());
    parts.push(format!("[{previous}]{}[v]", final_filters.join(",")));

    let mut audio_labels = Vec::new();
    for (index, source) in sources
        .iter()
        .enumerate()
        .filter(|(_, source)| source.audio_enabled && source.item.freeze_frame_us.is_none())
    {
        let label = format!("aud{index}");
        parts.push(audio_chain(source, &label));
        audio_labels.push(label);
    }
    if audio_labels.is_empty() {
        parts.push(format!(
            "anullsrc=channel_layout=stereo:sample_rate=48000:d={:0.6}[a]",
            context.duration
        ));
    } else {
        let inputs = audio_labels
            .iter()
            .map(|label| format!("[{label}]"))
            .collect::<String>();
        parts.push(format!(
            "{inputs}amix=inputs={}:normalize=0:dropout_transition=0,atrim=duration={:0.6}[a]",
            audio_labels.len(),
            context.duration
        ));
    }
    parts.join(";")
}

fn video_chain(source: &Source<'_>, context: &RenderContext, output: &str) -> String {
    let item = source.item;
    let duration = item.duration_us as f64 / 1_000_000.0;
    let start = item.start_us as f64 / 1_000_000.0;
    let mut filters = Vec::new();
    if source.asset.kind == "image" {
        filters.push(format!("trim=duration={duration:0.6}"));
        filters.push("setpts=PTS-STARTPTS".into());
    } else if let Some(freeze) = item.freeze_frame_us {
        let frame = 1.0 / context.fps;
        filters.push(format!(
            "trim=start={:0.6}:end={:0.6}",
            freeze as f64 / 1_000_000.0,
            freeze as f64 / 1_000_000.0 + frame
        ));
        filters.push("setpts=PTS-STARTPTS".into());
        filters.push(format!(
            "loop=loop=-1:size=1:start=0,trim=duration={duration:0.6}"
        ));
    } else {
        let source_span = item.duration_us as f64 * average_speed(item) as f64 / 1_000_000.0;
        let source_in = item.source_in_us as f64 / 1_000_000.0;
        let source_out = item.source_out_us as f64 / 1_000_000.0;
        let (trim_start, trim_end) = if item.reversed {
            ((source_out - source_span).max(source_in), source_out)
        } else {
            (source_in, (source_in + source_span).min(source_out))
        };
        filters.push(format!("trim=start={trim_start:0.6}:end={trim_end:0.6}"));
        if item.reversed {
            filters.push("reverse".into());
        }
        if item.speed_points.is_empty() {
            filters.push(format!("setpts=(PTS-STARTPTS)/{:0.6}", item.playback_rate));
        } else {
            filters.push(format!(
                "setpts='(PTS-STARTPTS)/({})'",
                speed_expression(item, "T")
            ));
        }
        filters.push(format!("trim=duration={duration:0.6}"));
    }
    let crop_x = item.crop.x.clamp(0.0, 0.99);
    let crop_y = item.crop.y.clamp(0.0, 0.99);
    let crop_width = item.crop.width.clamp(0.01, 1.0 - crop_x);
    let crop_height = item.crop.height.clamp(0.01, 1.0 - crop_y);
    if crop_x > 0.0 || crop_y > 0.0 || crop_width < 1.0 || crop_height < 1.0 {
        filters.push(format!("crop=w='iw*{crop_width:.6}':h='ih*{crop_height:.6}':x='iw*{crop_x:.6}':y='ih*{crop_y:.6}'"));
    }
    if item.flip_horizontal {
        filters.push("hflip".into());
    }
    if item.flip_vertical {
        filters.push("vflip".into());
    }
    let scale = animation_expression(item, Property::Scale, item.scale);
    let rotation = animation_expression(item, Property::Rotation, item.rotation);
    let brightness = animation_expression(item, Property::Brightness, item.brightness);
    let contrast = animation_expression(item, Property::Contrast, item.contrast);
    let saturation = animation_expression(item, Property::Saturation, item.saturation);
    filters.push(format!(
        "scale={}:{}:force_original_aspect_ratio=decrease,setsar=1",
        context.width, context.height
    ));
    filters.push(format!("scale=w='iw*{scale}':h='ih*{scale}':eval=frame"));
    filters.push(format!(
        "rotate='({rotation})*PI/180':c=none:ow=rotw(iw):oh=roth(ih)"
    ));
    filters.push(format!(
        "eq=brightness='{brightness}':contrast='{contrast}':saturation='{saturation}':eval=frame"
    ));
    for effect in &item.effects {
        if effect.enabled {
            filters.push(effect_filter(effect));
        }
    }
    let advanced = &item.advanced_color;
    if advanced.exposure != 0.0 {
        filters.push(format!("exposure=exposure={:.4}", advanced.exposure));
    }
    if advanced.vibrance != 0.0 {
        filters.push(format!("vibrance=intensity={:.4}", advanced.vibrance));
    }
    if advanced.temperature != 0.0 || advanced.tint != 0.0 {
        filters.push(format!(
            "colorbalance=rs={:.4}:bs={:.4}:gm={:.4}",
            advanced.temperature * 0.25,
            -advanced.temperature * 0.25,
            advanced.tint * 0.2
        ));
    }
    if advanced.highlights != 0.0 || advanced.shadows != 0.0 {
        filters.push(format!(
            "colorbalance=rh={0:.4}:gh={0:.4}:bh={0:.4}:rs={1:.4}:gs={1:.4}:bs={1:.4}",
            advanced.highlights * 0.2,
            advanced.shadows * 0.2
        ));
    }
    if advanced.fade != 0.0 {
        filters.push(format!(
            "curves=all='0/{:.4} 1/{:.4}'",
            advanced.fade.max(0.0) * 0.12,
            1.0 - advanced.fade.max(0.0) * 0.08
        ));
    }
    if advanced.whites != 0.0 || advanced.blacks != 0.0 {
        filters.push(format!(
            "eq=brightness={:.4}:gamma={:.4}",
            advanced.whites * 0.10 + advanced.blacks * 0.04,
            (1.0 - advanced.blacks * 0.15).clamp(0.5, 2.0)
        ));
    }
    if let Some(path) = item
        .lut_path
        .as_deref()
        .filter(|_| item.lut_intensity > 0.0)
    {
        filters.push(format!("lut3d=file='{}'", filter_path(path)));
    }
    if item.stabilization.enabled {
        let radius = if item.stabilization.strength < 0.5 {
            16
        } else {
            32
        };
        filters.push(format!("deshake=rx={radius}:ry={radius}:edge=mirror"));
    }
    filters.push("format=rgba".into());
    if item.chroma_key.enabled {
        filters.push(format!(
            "colorkey=0x{}:{:.4}:{:.4}",
            &item.chroma_key.key_color[1..],
            item.chroma_key.tolerance,
            item.chroma_key.softness
        ));
        if item.chroma_key.spill > 0.0 {
            filters.push(format!(
                "despill=type=green:mix={:.4}",
                item.chroma_key.spill
            ));
        }
        if item.chroma_key.inverted {
            filters.push("negate=negate_alpha=1".into());
        }
    }
    if item.auto_background.enabled {
        filters.push(format!(
            "colorkey=0x{}:{:.4}:{:.4}",
            &item.auto_background.sampled_color[1..],
            0.12 + item.auto_background.refinement * 0.45,
            0.04 + item.auto_background.temporal_smoothing * 0.12
        ));
    }
    if item.mask.r#type != "none" {
        filters.push(mask_filter(item));
    }
    let opacity = animation_expression_at(item, Property::Opacity, item.opacity, "T");
    let chroma_opacity = if item.chroma_key.enabled {
        item.chroma_key.opacity
    } else {
        1.0
    };
    filters.push(format!(
        "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*({opacity})*{chroma_opacity:.4}'"
    ));
    if item.transition_in.duration_us > 0 {
        let transition = item.transition_in.duration_us as f64 / 1_000_000.0;
        filters.push(format!("fade=t=in:st=0:d={transition:0.6}:alpha=1"));
    }
    if item.transition_out.duration_us > 0 {
        let transition = item.transition_out.duration_us as f64 / 1_000_000.0;
        filters.push(format!(
            "fade=t=out:st={:0.6}:d={transition:0.6}:alpha=1",
            (duration - transition).max(0.0)
        ));
    }
    filters.push(format!("setpts=PTS+{start:0.6}/TB"));
    format!("[{}:v]{}[{output}]", source.input, filters.join(","))
}

fn audio_chain(source: &Source<'_>, output: &str) -> String {
    let item = source.item;
    let duration = item.duration_us as f64 / 1_000_000.0;
    let source_span = duration * average_speed(item) as f64;
    let source_in = item.source_in_us as f64 / 1_000_000.0;
    let source_out = item.source_out_us as f64 / 1_000_000.0;
    let (trim_start, trim_end) = if item.reversed {
        ((source_out - source_span).max(source_in), source_out)
    } else {
        (source_in, (source_in + source_span).min(source_out))
    };
    let mut filters = vec![format!("atrim=start={trim_start:0.6}:end={trim_end:0.6}")];
    if item.reversed {
        filters.push("areverse".into());
    }
    filters.push("asetpts=PTS-STARTPTS".into());
    filters.extend(atempo_filters(average_speed(item)));
    filters.push(format!("atrim=duration={duration:0.6}"));
    filters.push("aformat=channel_layouts=stereo".into());
    filters.push(format!("volume={:0.6}", item.volume * source.track_gain));
    filters.push(format!(
        "stereotools=balance_out={:.4}",
        source.track_pan.clamp(-1.0, 1.0)
    ));
    if item.fade_in_us > 0 {
        filters.push(format!(
            "afade=t=in:st=0:d={:0.6}",
            item.fade_in_us as f64 / 1_000_000.0
        ));
    }
    if item.fade_out_us > 0 {
        let fade = item.fade_out_us as f64 / 1_000_000.0;
        filters.push(format!(
            "afade=t=out:st={:0.6}:d={fade:0.6}",
            (duration - fade).max(0.0)
        ));
    }
    filters.push(format!(
        "adelay={}|{}",
        item.start_us / 1000,
        item.start_us / 1000
    ));
    format!("[{}:a]{}[{output}]", source.input, filters.join(","))
}

fn atempo_filters(rate: f32) -> Vec<String> {
    let mut remaining = rate as f64;
    let mut filters = Vec::new();
    while remaining > 2.0 {
        filters.push("atempo=2".into());
        remaining /= 2.0;
    }
    while remaining < 0.5 {
        filters.push("atempo=0.5".into());
        remaining /= 0.5;
    }
    filters.push(format!("atempo={remaining:0.6}"));
    filters
}

#[derive(Clone, Copy)]
enum Property {
    PositionX,
    PositionY,
    Scale,
    Rotation,
    Brightness,
    Contrast,
    Saturation,
    Opacity,
}
fn property_value(frame: &Keyframe, property: Property) -> f32 {
    match property {
        Property::PositionX => frame.position_x,
        Property::PositionY => frame.position_y,
        Property::Scale => frame.scale,
        Property::Rotation => frame.rotation,
        Property::Brightness => frame.brightness,
        Property::Contrast => frame.contrast,
        Property::Saturation => frame.saturation,
        Property::Opacity => frame.opacity,
    }
}
fn animation_expression(item: &TimelineItem, property: Property, base: f32) -> String {
    animation_expression_at(item, property, base, "t")
}
fn animation_expression_at(
    item: &TimelineItem,
    property: Property,
    base: f32,
    time: &str,
) -> String {
    if item.keyframes.is_empty() {
        return format!("{base:0.6}");
    }
    let mut frames = item.keyframes.clone();
    frames.sort_by_key(|frame| frame.time_us);
    let mut expression = format!(
        "{:0.6}",
        property_value(frames.last().expect("non-empty"), property)
    );
    for index in (0..frames.len()).rev() {
        let next = &frames[index];
        let previous_time = if index == 0 {
            0.0
        } else {
            frames[index - 1].time_us as f64 / 1_000_000.0
        };
        let previous_value = if index == 0 {
            base
        } else {
            property_value(&frames[index - 1], property)
        };
        let next_time = next.time_us as f64 / 1_000_000.0;
        let span = (next_time - previous_time).max(0.000001);
        let progress = easing_expression(
            &next.easing,
            &format!("max(0,min(1,({time}-{previous_time:0.6})/{span:0.6}))"),
        );
        let value = format!(
            "{previous_value:0.6}+({:0.6}-{previous_value:0.6})*({progress})",
            property_value(next, property)
        );
        expression = format!("if(lt({time}\\,{next_time:0.6})\\,{value}\\,{expression})");
    }
    expression
}
fn easing_expression(easing: &str, progress: &str) -> String {
    match easing {
        "ease-in" => format!("pow({progress},2)"),
        "ease-out" => format!("1-pow(1-{progress},2)"),
        "ease-in-out" => format!(
            "if(lt({progress}\\,0.5)\\,2*pow({progress}\\,2)\\,1-pow(-2*{progress}+2\\,2)/2)"
        ),
        _ => progress.into(),
    }
}
fn overlay_x(item: &TimelineItem, _context: &RenderContext) -> String {
    let start = item.start_us as f64 / 1_000_000.0;
    let end = (item.start_us + item.duration_us) as f64 / 1_000_000.0;
    let local_time = format!("(t-{start:.6})");
    let tracking = tracking_expression(item, &local_time, true);
    let mut base = format!(
        "(W-w)/2+{}",
        animation_expression_at(item, Property::PositionX, item.position_x, &local_time)
    ) + &tracking;
    if item.transition_in.r#type == "slide-left" && item.transition_in.duration_us > 0 {
        base = format!(
            "{base}-W*(1-min(1,max(0,(t-{start:.6})/{:.6})))",
            item.transition_in.duration_us as f64 / 1_000_000.0
        );
    }
    if item.transition_out.r#type == "slide-left" && item.transition_out.duration_us > 0 {
        base = format!(
            "{base}-W*(1-min(1,max(0,({end:.6}-t)/{:.6})))",
            item.transition_out.duration_us as f64 / 1_000_000.0
        );
    }
    base
}
fn effect_filter(effect: &EffectInstance) -> String {
    match effect.r#type.as_str() {
        "blur" => format!("gblur=sigma={:0.3}", effect.amount * 10.0),
        "sharpen" => format!("unsharp=5:5:{:0.3}", effect.amount * 2.0),
        "grayscale" => format!("hue=s={:0.3}", 1.0 - effect.amount),
        "vignette" => format!(
            "vignette=angle={:0.6}",
            std::f32::consts::FRAC_PI_4 * effect.amount
        ),
        _ => "null".into(),
    }
}
fn mask_filter(item: &TimelineItem) -> String {
    let mask = &item.mask;
    let cx = format!("W*{:0.6}", 0.5 + mask.x * 0.5);
    let cy = format!("H*{:0.6}", 0.5 + mask.y * 0.5);
    let inside = if mask.r#type == "ellipse" {
        format!(
            "lte(pow((X-{cx})/(W*{:0.6}),2)+pow((Y-{cy})/(H*{:0.6}),2),1)",
            mask.width * 0.5,
            mask.height * 0.5
        )
    } else {
        format!(
            "between(X,{cx}-W*{:0.6},{cx}+W*{:0.6})*between(Y,{cy}-H*{:0.6},{cy}+H*{:0.6})",
            mask.width * 0.5,
            mask.width * 0.5,
            mask.height * 0.5,
            mask.height * 0.5
        )
    };
    let condition = if mask.inverted {
        format!("not({inside})")
    } else {
        inside
    };
    let mut filter =
        format!("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if({condition},alpha(X,Y),0)'");
    if mask.feather > 0.0 {
        filter.push_str(&format!(
            ",gblur=sigma={:0.3}:planes=8",
            mask.feather * 20.0
        ));
    }
    filter
}
fn speed_expression(item: &TimelineItem, time: &str) -> String {
    if item.speed_points.is_empty() {
        return format!("{:.6}", item.playback_rate);
    }
    let mut points = item.speed_points.clone();
    points.sort_by_key(|point| point.time_us);
    let mut expression = format!(
        "{:.6}",
        points
            .last()
            .map(|point| point.rate)
            .unwrap_or(item.playback_rate)
    );
    for index in (0..points.len()).rev() {
        let next = &points[index];
        let previous_time = if index == 0 {
            0.0
        } else {
            points[index - 1].time_us as f64 / 1_000_000.0
        };
        let previous_rate = if index == 0 {
            item.playback_rate
        } else {
            points[index - 1].rate
        };
        let next_time = next.time_us as f64 / 1_000_000.0;
        let span = (next_time - previous_time).max(0.000001);
        let progress = easing_expression(
            &next.easing,
            &format!("max(0,min(1,({time}-{previous_time:.6})/{span:.6}))"),
        );
        let value = format!(
            "{previous_rate:.6}+({:.6}-{previous_rate:.6})*({progress})",
            next.rate
        );
        expression = format!("if(lt({time}\\,{next_time:.6})\\,{value}\\,{expression})");
    }
    expression
}
fn average_speed(item: &TimelineItem) -> f32 {
    if item.speed_points.is_empty() {
        item.playback_rate
    } else {
        let total = item
            .speed_points
            .iter()
            .map(|point| point.rate)
            .sum::<f32>()
            + item.playback_rate;
        total / (item.speed_points.len() as f32 + 1.0)
    }
}
fn tracking_expression(item: &TimelineItem, time: &str, horizontal: bool) -> String {
    if !item.motion_tracking.analyzed || item.motion_tracking.points.len() < 2 {
        return String::new();
    }
    let first = &item.motion_tracking.points[0];
    let base = if horizontal { first.x } else { first.y };
    let scale = if horizontal { 1920.0 } else { 1080.0 };
    let mut points = item.motion_tracking.points.clone();
    points.sort_by_key(|point| point.time_us);
    let mut expression = format!(
        "+{:.4}",
        ((if horizontal {
            points.last().unwrap().x
        } else {
            points.last().unwrap().y
        }) - base)
            * scale
    );
    for point in points.iter().rev() {
        let value = ((if horizontal { point.x } else { point.y }) - base) * scale;
        expression = format!(
            "+if(lt({time}\\,{:.6})\\,{value:.4}\\,0){expression}",
            point.time_us as f64 / 1_000_000.0
        );
    }
    expression
}
fn caption_filter(caption: &Caption) -> String {
    let style = &caption.style;
    let x = match style.alignment.as_str() {
        "left" => "w*0.08",
        "right" => "w-tw-w*0.08",
        _ => "(w-tw)/2",
    };
    let y = format!("h*{:.4}-th/2", style.position_y);
    let text = filter_text(&caption.text);
    format!("drawtext=font='{}':text='{}':fontsize={:.2}:fontcolor={}:borderw={:.2}:bordercolor={}:box=1:boxcolor={}@{:.3}:shadowx={}:shadowy={}:x={}:y={}:enable='between(t,{:.6},{:.6})'", filter_text(&style.font_family), text, style.font_size, style.color, style.stroke_width, style.stroke_color, style.background_color, style.background_opacity, if style.shadow { 2 } else { 0 }, if style.shadow { 2 } else { 0 }, x, y, caption.start_us as f64 / 1_000_000.0, caption.end_us as f64 / 1_000_000.0)
}
fn filter_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace('%', "\\%")
}
fn filter_path(value: &str) -> String {
    value
        .replace('\\', "/")
        .replace(':', "\\:")
        .replace('\'', "\\'")
}
fn check_ffmpeg(output: std::process::Output) -> AppResult<()> {
    if output.status.success() {
        return Ok(());
    }
    let details = String::from_utf8_lossy(&output.stderr)
        .lines()
        .rev()
        .take(12)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    Err(AppError::Media(details))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{MaskSettings, Rational, Sequence, Track, TransitionSettings};
    use serde_json::Value;
    use std::{fs, path::PathBuf, process::Stdio};
    use uuid::Uuid;

    fn vendor_binary(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("vendor")
            .join("ffmpeg")
            .join("bin")
            .join(format!("{name}{}", std::env::consts::EXE_SUFFIX))
    }
    fn sample_item(id: &str, asset_id: &str, track_id: &str, start_us: i64) -> TimelineItem {
        TimelineItem {
            id: id.into(),
            asset_id: asset_id.into(),
            track_id: track_id.into(),
            name: id.into(),
            kind: "video".into(),
            start_us,
            duration_us: 1_000_000,
            source_in_us: 0,
            source_out_us: 1_000_000,
            volume: 0.8,
            opacity: 0.8,
            position_x: 0.0,
            position_y: 0.0,
            scale: 1.0,
            rotation: 0.0,
            crop: Default::default(),
            flip_horizontal: false,
            flip_vertical: false,
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
            fade_in_us: 100_000,
            fade_out_us: 100_000,
            playback_rate: 1.0,
            reversed: false,
            freeze_frame_us: None,
            blend_mode: "normal".into(),
            mask: MaskSettings::default(),
            keyframes: Vec::new(),
            effects: Vec::new(),
            transition_in: TransitionSettings::default(),
            transition_out: TransitionSettings::default(),
            speed_points: Vec::new(),
            chroma_key: Default::default(),
            auto_background: Default::default(),
            advanced_color: Default::default(),
            lut_path: None,
            lut_intensity: 1.0,
            stabilization: Default::default(),
            motion_tracking: Default::default(),
            linked_item_ids: Vec::new(),
            compound_sequence_id: None,
        }
    }

    #[test]
    fn builds_animation_compositing_and_retiming_filters() {
        let mut item = sample_item("clip", "asset", "track", 500_000);
        item.playback_rate = 2.0;
        item.reversed = true;
        item.blend_mode = "screen".into();
        item.crop.x = 0.1;
        item.crop.width = 0.8;
        item.flip_horizontal = true;
        item.mask = MaskSettings {
            r#type: "ellipse".into(),
            width: 0.8,
            height: 0.6,
            feather: 0.1,
            ..MaskSettings::default()
        };
        item.keyframes = vec![Keyframe {
            id: "k".into(),
            time_us: 500_000,
            easing: "ease-in-out".into(),
            position_x: 100.0,
            position_y: 0.0,
            scale: 1.5,
            rotation: 45.0,
            opacity: 0.5,
            brightness: 0.1,
            contrast: 1.2,
            saturation: 0.8,
        }];
        item.effects.push(EffectInstance {
            id: "fx".into(),
            r#type: "blur".into(),
            enabled: true,
            amount: 0.5,
        });
        item.transition_in = TransitionSettings {
            r#type: "slide-left".into(),
            duration_us: 250_000,
        };
        let asset = MediaAsset {
            id: "asset".into(),
            name: "clip".into(),
            path: "clip.mp4".into(),
            kind: "video".into(),
            duration_us: 1_000_000,
            width: None,
            height: None,
            codec: None,
            size_bytes: None,
            missing: None,
            proxy_path: None,
            proxy_enabled: false,
            proxy_status: "none".into(),
            favorite: false,
            has_audio: Some(true),
        };
        let source = Source {
            item: &item,
            asset: &asset,
            input: 0,
            visual: true,
            audio_enabled: true,
            track_gain: 0.5,
            track_pan: 0.4,
        };
        let context = RenderContext {
            width: 1920,
            height: 1080,
            fps: 30.0,
            duration: 2.0,
        };
        let filter = compositor_filter(&[source], &context, &[]);
        assert!(filter.contains("reverse"));
        assert!(filter.contains("crop=w='iw*0.800000'"));
        assert!(filter.contains("hflip"));
        assert!(filter.contains("setpts=(PTS-STARTPTS)/2.000000"));
        assert!(filter.contains("gblur=sigma=5.000"));
        assert!(filter.contains("geq="));
        assert!(filter.contains("all_mode=screen"));
        assert!(filter.contains("pow("));
        assert!(filter.contains("adelay=500|500"));
        assert!(filter.contains("volume=0.400000"));
        assert!(filter.contains("stereotools=balance_out=0.4000"));
    }

    #[test]
    fn exports_overlapping_layers_to_playable_mp4() {
        let directory =
            std::env::temp_dir().join(format!("openframe-compositor-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let source_path = directory.join("source.mp4");
        let output = directory.join("output.mp4");
        let ffmpeg = vendor_binary("ffmpeg");
        let ffprobe = vendor_binary("ffprobe");
        let lut_path = directory.join("identity.cube");
        fs::write(
            &lut_path,
            "TITLE \"OpenFrame identity\"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n",
        )
        .unwrap();
        let status = hidden_command(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=320x180:r=30:d=1",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000:duration=1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
            ])
            .arg(&source_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
        let asset = MediaAsset {
            id: "asset".into(),
            name: "source.mp4".into(),
            path: source_path.to_string_lossy().into_owned(),
            kind: "video".into(),
            duration_us: 1_000_000,
            width: Some(320),
            height: Some(180),
            codec: Some("h264".into()),
            size_bytes: None,
            missing: Some(false),
            proxy_path: None,
            proxy_enabled: false,
            proxy_status: "none".into(),
            favorite: false,
            has_audio: Some(true),
        };
        let mut top = sample_item("top", "asset", "top-track", 0);
        top.scale = 0.5;
        top.position_x = 100.0;
        top.blend_mode = "screen".into();
        top.reversed = true;
        top.mask = MaskSettings {
            r#type: "ellipse".into(),
            width: 0.8,
            height: 0.8,
            feather: 0.05,
            ..MaskSettings::default()
        };
        top.effects.push(EffectInstance {
            id: "gray".into(),
            r#type: "grayscale".into(),
            enabled: true,
            amount: 0.5,
        });
        top.transition_in = TransitionSettings {
            r#type: "fade".into(),
            duration_us: 200_000,
        };
        top.keyframes.push(Keyframe {
            id: "move".into(),
            time_us: 800_000,
            easing: "ease-in-out".into(),
            position_x: -100.0,
            position_y: 40.0,
            scale: 0.8,
            rotation: 12.0,
            opacity: 0.7,
            brightness: 0.1,
            contrast: 1.1,
            saturation: 0.9,
        });
        top.speed_points = vec![crate::project::SpeedPoint {
            id: "ramp".into(),
            time_us: 800_000,
            rate: 1.2,
            easing: "ease-in-out".into(),
        }];
        top.advanced_color.exposure = 0.1;
        top.advanced_color.vibrance = 0.15;
        top.advanced_color.temperature = 0.1;
        top.advanced_color.tint = -0.05;
        top.advanced_color.highlights = 0.1;
        top.advanced_color.shadows = -0.1;
        top.advanced_color.whites = 0.1;
        top.advanced_color.blacks = -0.1;
        top.advanced_color.fade = 0.05;
        top.lut_path = Some(lut_path.to_string_lossy().into_owned());
        top.lut_intensity = 0.8;
        top.stabilization.enabled = true;
        top.chroma_key.enabled = true;
        top.chroma_key.spill = 0.0;
        top.chroma_key.opacity = 0.85;
        top.motion_tracking.analyzed = true;
        top.motion_tracking.points = vec![
            crate::project::TrackingPoint {
                time_us: 0,
                x: 0.5,
                y: 0.5,
                confidence: 1.0,
            },
            crate::project::TrackingPoint {
                time_us: 800_000,
                x: 0.55,
                y: 0.52,
                confidence: 0.9,
            },
        ];
        let mut bottom = sample_item("bottom", "asset", "bottom-track", 0);
        bottom.auto_background.enabled = true;
        bottom.auto_background.sampled_color = "#000000".into();
        let project = Project {
            schema_version: 1,
            id: "project".into(),
            name: "Compositor".into(),
            created_at: "2026-08-13T00:00:00Z".into(),
            modified_at: "2026-08-13T00:00:00Z".into(),
            project_path: None,
            workspace: "video".into(),
            assets: vec![asset],
            favorite_asset_ids: Vec::new(),
            design: None,
            sequence: Sequence {
                id: "sequence".into(),
                name: "Main".into(),
                width: 640,
                height: 360,
                frame_rate: Rational {
                    numerator: 30,
                    denominator: 1,
                },
                captions: vec![Caption {
                    id: "caption".into(),
                    start_us: 0,
                    end_us: 900_000,
                    text: "OpenFrame M4".into(),
                    words: Vec::new(),
                    style: Default::default(),
                }],
                markers: Vec::new(),
                compound: false,
                parent_sequence_id: None,
                tracks: vec![
                    Track {
                        id: "top-track".into(),
                        name: "Video 1".into(),
                        kind: "video".into(),
                        locked: false,
                        muted: false,
                        visible: true,
                        gain: 1.0,
                        pan: 0.0,
                        solo: false,
                        items: vec![top],
                    },
                    Track {
                        id: "bottom-track".into(),
                        name: "Video 2".into(),
                        kind: "video".into(),
                        locked: false,
                        muted: false,
                        visible: true,
                        gain: 1.0,
                        pan: 0.0,
                        solo: false,
                        items: vec![bottom],
                    },
                ],
            },
            sequences: Vec::new(),
            active_sequence_id: String::new(),
            settings: Default::default(),
        };
        export(&project, &output, &ffmpeg, &ffprobe, None).unwrap();
        let probe_output = hidden_command(&ffprobe)
            .args(["-v", "error", "-show_streams", "-of", "json"])
            .arg(&output)
            .output()
            .unwrap();
        assert!(probe_output.status.success());
        let value: Value = serde_json::from_slice(&probe_output.stdout).unwrap();
        let streams = value["streams"].as_array().unwrap();
        assert!(streams.iter().any(|stream| stream["codec_type"] == "video"));
        assert!(streams.iter().any(|stream| stream["codec_type"] == "audio"));
        fs::remove_dir_all(directory).unwrap();
    }
}
