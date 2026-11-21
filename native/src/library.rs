use lofty::{file::AudioFile, file::TaggedFileExt, prelude::Accessor, probe::Probe, tag::ItemKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use walkdir::WalkDir;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub track_number: u32,
    pub title: String,
    pub artist: String,
    pub composer: String,
    pub duration: String,
    pub audio_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Credit {
    pub label: String,
    pub value: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub catalog_number: String,
    pub title: String,
    pub subtitle: String,
    pub artist: String,
    pub release_date: String,
    pub publisher: String,
    pub studio: String,
    pub artwork: String,
    pub aspect_ratio: String,
    pub dimensions: String,
    pub description: String,
    pub video_url: Option<String>,
    pub tracks: Vec<Track>,
    pub credits: Vec<Credit>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Library {
    pub version: u32,
    pub roots: Vec<PathBuf>,
    pub albums: Vec<Album>,
}

impl Default for Library {
    fn default() -> Self {
        Self {
            version: 1,
            roots: vec![],
            albums: vec![],
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub library: Library,
    pub added_tracks: usize,
    pub existing_tracks: usize,
    pub warnings: Vec<String>,
}

pub fn load(path: &Path) -> Result<Library, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Library::default()),
        Err(error) => return Err(format!("无法读取音乐库：{error}")),
    };
    let mut library: Library = serde_json::from_slice(&bytes).map_err(|_| {
        "音乐库记录无法读取。请保留 library.json 和 library.json.bak，以便恢复。".to_string()
    })?;
    if library.version != 1 {
        return Err("音乐库来自较新版本，请升级应用后再打开。".into());
    }
    if library.albums.iter().any(|album| album.tracks.is_empty()) {
        return Err("音乐库记录不完整，请从备份恢复。".into());
    }
    for album in &mut library.albums {
        set_artwork_dimensions(album);
    }
    Ok(library)
}

fn set_artwork_dimensions(album: &mut Album) {
    if album.artwork.is_empty() || !album.dimensions.is_empty() {
        return;
    }
    if let Ok(size) = imagesize::size(&album.artwork) {
        album.dimensions = format!("{} × {}", size.width, size.height);
        album.aspect_ratio = if size.width > size.height {
            "landscape"
        } else {
            "portrait"
        }
        .into();
    }
}

/// Replace the index atomically; a failed write never truncates the existing library.
pub fn save(path: &Path, library: &Library) -> Result<(), String> {
    let parent = path.parent().ok_or("音乐库保存位置无效")?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建音乐库目录：{error}"))?;
    let bytes = serde_json::to_vec_pretty(library).map_err(|error| error.to_string())?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temporary
        .write_all(&bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("无法保存音乐库，请检查磁盘空间：{error}"))?;
    if path.exists() {
        fs::copy(path, path.with_extension("json.bak"))
            .map_err(|error| format!("无法备份音乐库：{error}"))?;
    }
    temporary
        .persist(path)
        .map_err(|error| format!("无法保存音乐库：{error}"))?;
    Ok(())
}

fn extension(path: &Path) -> String {
    path.extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase()
}

fn is_audio(path: &Path) -> bool {
    matches!(
        extension(path).as_str(),
        "mp3" | "flac" | "m4a" | "aac" | "wav" | "ogg" | "opus" | "aif" | "aiff"
    )
}

fn stable_id(prefix: &str, value: &str) -> String {
    format!("{prefix}-{:x}", Sha256::digest(value.as_bytes()))
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn file_title(path: &Path) -> String {
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let without_digits = stem.trim_start_matches(|c: char| c.is_ascii_digit());
    let title = if without_digits.starts_with(['.', '-', '_', ' ']) {
        without_digits.trim_start_matches(['.', '-', '_', ' '])
    } else {
        &stem
    };
    if title.is_empty() {
        stem.into_owned()
    } else {
        title.to_string()
    }
}

fn file_number(path: &Path) -> u32 {
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .unwrap_or(0)
}

fn sibling_media(folder: &Path) -> (String, Option<String>) {
    let mut paths: Vec<_> = fs::read_dir(folder)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.path())
        .collect();
    paths.sort();
    let images: Vec<_> = paths
        .iter()
        .filter(|path| matches!(extension(path).as_str(), "jpg" | "jpeg" | "png" | "webp"))
        .collect();
    let cover = images
        .iter()
        .find(|path| {
            matches!(
                path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase()
                    .as_str(),
                "cover" | "front" | "folder" | "封面"
            )
        })
        .or_else(|| images.first())
        .map(|path| path_string(path))
        .unwrap_or_default();
    let videos: Vec<_> = paths
        .iter()
        .filter(|path| matches!(extension(path).as_str(), "mp4" | "webm" | "m4v"))
        .collect();
    let video = if videos.len() == 1 {
        Some(path_string(videos[0]))
    } else {
        None
    };
    (cover, video)
}

fn warning(warnings: &mut Vec<String>, message: String) {
    // Keep error reports bounded even for very large or partially unreadable folders.
    if warnings.len() < 50 {
        warnings.push(message);
    }
}

/// Read only tags and media properties. Original files are never modified or copied.
pub fn import(root: &Path, current: Library, cache: &Path) -> Result<ImportResult, String> {
    let root = root
        .canonicalize()
        .map_err(|_| "这个文件夹已无法访问，请重新选择音乐文件夹。".to_string())?;
    if !root.is_dir() {
        return Err("请选择一个音乐文件夹。".into());
    }
    fs::create_dir_all(cache).map_err(|error| format!("无法创建封面缓存：{error}"))?;
    let mut groups: BTreeMap<String, Album> = BTreeMap::new();
    let mut explicit_artists = HashSet::new();
    let mut warnings = vec![];
    let mut seen_paths = HashSet::new();
    for entry in WalkDir::new(&root).follow_links(false).sort_by_file_name() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                warning(&mut warnings, format!("已跳过无法访问的文件：{error}"));
                continue;
            }
        };
        if !entry.file_type().is_file() || !is_audio(entry.path()) {
            continue;
        }
        let path = match entry.path().canonicalize() {
            Ok(path) => path,
            Err(_) => {
                warning(
                    &mut warnings,
                    format!("文件已无法访问：{}", entry.path().display()),
                );
                continue;
            }
        };
        if !seen_paths.insert(path.clone()) {
            continue;
        }
        let folder = path.parent().unwrap_or(&root);
        let mut album_title = folder
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let mut title = file_title(&path);
        let mut artist = "未知艺术家".to_string();
        let mut album_artist = String::new();
        let mut composer = String::new();
        let mut year = String::new();
        let mut duration = "--:--".to_string();
        let mut number = file_number(&path);
        let mut embedded_cover = String::new();
        match Probe::open(&path).and_then(|probe| probe.read()) {
            Ok(tagged) => {
                let seconds = tagged.properties().duration().as_secs();
                duration = format!("{:02}:{:02}", seconds / 60, seconds % 60);
                if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
                    if let Some(value) = tag.title().filter(|value| !value.trim().is_empty()) {
                        title = value.trim().to_string();
                    }
                    if let Some(value) = tag.album().filter(|value| !value.trim().is_empty()) {
                        album_title = value.trim().to_string();
                    }
                    if let Some(value) = tag.artist().filter(|value| !value.trim().is_empty()) {
                        artist = value.trim().to_string();
                    }
                    album_artist = tag
                        .get_string(ItemKey::AlbumArtist)
                        .unwrap_or_default()
                        .trim()
                        .to_string();
                    composer = tag
                        .get_string(ItemKey::Composer)
                        .unwrap_or_default()
                        .to_string();
                    year = tag
                        .date()
                        .map(|value| value.to_string())
                        .unwrap_or_default();
                    number = tag.track().unwrap_or(number);
                    if let Some(picture) = tag.pictures().first() {
                        let data = picture.data();
                        if data.len() <= 20 * 1024 * 1024 {
                            let suffix = match picture.mime_type().map(|mime| mime.as_str()) {
                                Some("image/png") => "png",
                                Some("image/webp") => "webp",
                                Some("image/gif") => "gif",
                                _ => "jpg",
                            };
                            let cover = cache.join(format!(
                                "{}.{suffix}",
                                stable_id("cover", &format!("{:x}", Sha256::digest(data)))
                            ));
                            if cover.exists() || fs::write(&cover, data).is_ok() {
                                embedded_cover = path_string(&cover);
                            }
                        }
                    }
                }
            }
            Err(_) => warning(
                &mut warnings,
                format!(
                    "未能读取标签，已按文件名导入：{}",
                    path.file_name().unwrap_or_default().to_string_lossy()
                ),
            ),
        }
        let key = format!("{}\0{album_title}", folder.display());
        let album = groups.entry(key.clone()).or_insert_with(|| {
            let (cover, video) = sibling_media(folder);
            Album {
                id: stable_id("local-album", &key),
                catalog_number: "本地典藏".into(),
                title: album_title,
                subtitle: "本地音乐收藏".into(),
                artist: if album_artist.is_empty() {
                    artist.clone()
                } else {
                    album_artist.clone()
                },
                release_date: year,
                publisher: String::new(),
                studio: String::new(),
                artwork: if embedded_cover.is_empty() {
                    cover
                } else {
                    embedded_cover.clone()
                },
                aspect_ratio: "portrait".into(),
                dimensions: String::new(),
                description: "从本地文件夹收录。音乐文件保留在原位置。".into(),
                video_url: video,
                tracks: vec![],
                credits: vec![],
            }
        });
        if album.artwork.is_empty() && !embedded_cover.is_empty() {
            album.artwork = embedded_cover;
        }
        if !album_artist.is_empty() {
            album.artist = album_artist;
            explicit_artists.insert(key.clone());
        } else if !explicit_artists.contains(&key) && album.artist != artist {
            album.artist = "群星".into();
        }
        album.tracks.push(Track {
            id: stable_id("local-track", &path_string(&path)),
            track_number: number,
            title,
            artist,
            composer,
            duration,
            audio_url: path_string(&path),
        });
    }
    if groups.is_empty() {
        return Err(
            "没有找到可导入的音频。请选择包含 MP3、FLAC、M4A、WAV、OGG 等音频的文件夹。".into(),
        );
    }
    let old_ids: HashSet<_> = current
        .albums
        .iter()
        .flat_map(|album| album.tracks.iter().map(|track| track.id.clone()))
        .collect();
    let incoming_ids: HashSet<_> = groups
        .values()
        .flat_map(|album| album.tracks.iter().map(|track| track.id.clone()))
        .collect();
    let added_tracks = incoming_ids.difference(&old_ids).count();
    let existing_tracks = incoming_ids.len() - added_tracks;
    let mut library = current;
    // Refresh existing tracks and avoid duplicates when a parent folder is imported later.
    for album in &mut library.albums {
        album
            .tracks
            .retain(|track| !incoming_ids.contains(&track.id));
    }
    for mut incoming in groups.into_values() {
        if let Some(existing) = library
            .albums
            .iter_mut()
            .find(|album| album.id == incoming.id)
        {
            incoming.tracks.append(&mut existing.tracks);
            *existing = incoming;
        } else {
            library.albums.push(incoming);
        }
    }
    library.albums.retain(|album| !album.tracks.is_empty());
    for album in &mut library.albums {
        set_artwork_dimensions(album);
        album.tracks.sort_by(|left, right| {
            left.track_number
                .cmp(&right.track_number)
                .then_with(|| left.audio_url.cmp(&right.audio_url))
        });
        for (index, track) in album.tracks.iter_mut().enumerate() {
            if track.track_number == 0 {
                track.track_number = index as u32 + 1;
            }
        }
    }
    if !library.roots.contains(&root) {
        library.roots.push(root);
    }
    Ok(ImportResult {
        library,
        added_tracks,
        existing_tracks,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_wave(path: &Path) {
        // A valid one-second mono PCM WAV, with no tags or artwork.
        let samples = vec![0u8; 8000 * 2];
        let mut bytes = vec![];
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36u32 + samples.len() as u32).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&8000u32.to_le_bytes());
        bytes.extend_from_slice(&16000u32.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&(samples.len() as u32).to_le_bytes());
        bytes.extend(samples);
        fs::write(path, bytes).unwrap();
    }

    #[test]
    fn imports_untagged_unicode_folder_and_restores_without_touching_originals() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("我的音乐");
        let album = root.join("测试专辑");
        fs::create_dir_all(&album).unwrap();
        let song = album.join("01. 第一首.WAV");
        write_wave(&song);
        let original = fs::read(&song).unwrap();
        fs::write(album.join("cover.jpg"), b"cover").unwrap();
        let imported = import(&root, Library::default(), &temp.path().join("covers")).unwrap();
        assert_eq!(imported.added_tracks, 1);
        assert_eq!(imported.library.albums[0].title, "测试专辑");
        assert_eq!(imported.library.albums[0].tracks[0].title, "第一首");
        assert_eq!(imported.library.albums[0].tracks[0].duration, "00:01");
        let index = temp.path().join("state/library.json");
        save(&index, &imported.library).unwrap();
        assert_eq!(
            load(&index).unwrap().albums[0].tracks[0].id,
            imported.library.albums[0].tracks[0].id
        );
        assert_eq!(fs::read(song).unwrap(), original);
    }

    #[test]
    fn overlapping_imports_deduplicate_and_new_tracks_are_added() {
        let temp = tempfile::tempdir().unwrap();
        let album = temp.path().join("music/album");
        fs::create_dir_all(&album).unwrap();
        write_wave(&album.join("01. Song.wav"));
        let first = import(&album, Library::default(), &temp.path().join("covers")).unwrap();
        write_wave(&album.join("02. Another.wav"));
        let next = import(
            &temp.path().join("music"),
            first.library,
            &temp.path().join("covers"),
        )
        .unwrap();
        assert_eq!((next.added_tracks, next.existing_tracks), (1, 1));
        assert_eq!(next.library.albums.len(), 1);
        assert_eq!(next.library.albums[0].tracks.len(), 2);
    }

    #[test]
    fn reads_tags_and_embedded_cover_without_rewriting_media() {
        use lofty::{
            config::WriteOptions,
            picture::{MimeType, Picture, PictureType},
            tag::{Tag, TagExt, TagType},
        };
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("music");
        fs::create_dir(&root).unwrap();
        let song = root.join("01. Filename.wav");
        write_wave(&song);
        let mut tag = Tag::new(TagType::Id3v2);
        tag.set_title("标签曲名".into());
        tag.set_album("标签专辑".into());
        tag.set_artist("演唱者".into());
        tag.set_track(3);
        tag.insert_text(ItemKey::AlbumArtist, "专辑艺术家".into());
        tag.insert_text(ItemKey::Composer, "作曲者".into());
        let cover_data = b"\x89PNG\r\n\x1a\ncover".to_vec();
        tag.push_picture(
            Picture::unchecked(cover_data.clone())
                .mime_type(MimeType::Png)
                .pic_type(PictureType::CoverFront)
                .build(),
        );
        tag.save_to_path(&song, WriteOptions::default()).unwrap();
        let original = fs::read(&song).unwrap();
        let result = import(&root, Library::default(), &temp.path().join("covers")).unwrap();
        let album = &result.library.albums[0];
        assert_eq!(album.title, "标签专辑");
        assert_eq!(album.artist, "专辑艺术家");
        assert_eq!(album.tracks[0].title, "标签曲名");
        assert_eq!(album.tracks[0].track_number, 3);
        assert_eq!(album.tracks[0].composer, "作曲者");
        assert_eq!(fs::read(&album.artwork).unwrap(), cover_data);
        assert!(album.artwork.ends_with(".png"));
        assert_eq!(fs::read(song).unwrap(), original);
    }

    #[test]
    fn empty_folder_and_corrupt_index_do_not_reset_an_existing_library() {
        let temp = tempfile::tempdir().unwrap();
        assert!(import(temp.path(), Library::default(), &temp.path().join("covers")).is_err());
        let index = temp.path().join("library.json");
        assert!(load(&index).unwrap().albums.is_empty());
        fs::write(&index, "broken").unwrap();
        assert!(load(&index).is_err());
        assert_eq!(fs::read_to_string(index).unwrap(), "broken");
    }

    #[test]
    fn repeated_saves_replace_index_and_keep_previous_backup() {
        let temp = tempfile::tempdir().unwrap();
        let index = temp.path().join("library.json");
        let first = Library::default();
        save(&index, &first).unwrap();
        let mut second = first;
        second.roots.push(PathBuf::from("music"));
        save(&index, &second).unwrap();
        assert_eq!(load(&index).unwrap().roots.len(), 1);
        assert!(load(&index.with_extension("json.bak"))
            .unwrap()
            .roots
            .is_empty());
    }
}
