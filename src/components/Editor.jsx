import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import YouTube from 'react-youtube';
import { supabase } from '../supabase';

const getYoutubeVideoId = (url) => {
  if (!url) return null;
  const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return match ? match[1] : null;
};

const formatTime = (secs) => {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Editor() {
  const { clipId } = useParams();
  const navigate = useNavigate();
  const [clip, setClip] = useState(null);
  const [title, setTitle] = useState('');
  const [subtitleSlots, setSubtitleSlots] = useState([]);
  const [player, setPlayer] = useState(null);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isInSlot, setIsInSlot] = useState(false);
  const intervalRef = useRef(null);
  const clipRef = useRef(null);
  const subtitleSlotsRef = useRef([]);

  useEffect(() => { clipRef.current = clip; }, [clip]);
  useEffect(() => { subtitleSlotsRef.current = subtitleSlots; }, [subtitleSlots]);

  useEffect(() => {
    fetchClip();
    fetchSubtitleSlots();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [clipId]);

  const fetchClip = async () => {
    const { data, error } = await supabase.from('clips').select('*').eq('id', clipId).single();
    if (error) console.error(error);
    else setClip(data);
  };

  const fetchSubtitleSlots = async () => {
    const { data, error } = await supabase
      .from('subtitle_slots')
      .select('*')
      .eq('clip_id', clipId)
      .order('slot_order', { ascending: true });
    if (error) console.error(error);
    else setSubtitleSlots(data);
  };

  const onPlayerReady = (event) => {
    setPlayer(event.target);
    const c = clipRef.current;
    if (c) {
      event.target.seekTo(c.start_time);
      setCurrentTime(c.start_time);
    }
  };

  const startPolling = (playerInstance) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const c = clipRef.current;
      if (!c) return;
      const raw = playerInstance.getCurrentTime();
      if (raw >= c.end_time) {
        playerInstance.seekTo(c.start_time, true);
        playerInstance.pauseVideo();
        setCurrentTime(c.start_time);
        setIsPlaying(false);
        setCurrentSubtitle('');
        setIsInSlot(false);
        clearInterval(intervalRef.current);
        return;
      }
      setCurrentTime(raw);
      const activeSlot = subtitleSlotsRef.current.find(
        s => raw >= s.start_time && raw <= s.end_time
      );
      setIsInSlot(!!activeSlot);
      setCurrentSubtitle(activeSlot ? activeSlot.text || '' : '');
    }, 200);
  };

  const handleStateChange = (event) => {
    if (event.data === 1) {
      setIsPlaying(true);
      startPolling(event.target);
    } else if (event.data === 2 || event.data === 0) {
      setIsPlaying(false);
      setIsInSlot(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (event.data === 0) {
        const c = clipRef.current;
        if (c) {
          event.target.seekTo(c.start_time);
          setCurrentTime(c.start_time);
        }
      }
    }
  };

  const togglePlay = () => {
    if (!player) return;
    if (isPlaying) player.pauseVideo();
    else player.playVideo();
  };

  const handleProgressClick = (e) => {
    if (!player || !clip) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const newTime = clip.start_time + ratio * (clip.end_time - clip.start_time);
    const clamped = Math.max(clip.start_time, Math.min(clip.end_time, newTime));
    player.seekTo(clamped);
    setCurrentTime(clamped);
  };

  const handleSave = async () => {
    const shareId = crypto.randomUUID();
    const subtitles = {};
    subtitleSlots.forEach(slot => { subtitles[slot.id] = slot.text || ''; });
    const { error } = await supabase.from('shares').insert({
      id: shareId,
      clip_id: clipId,
      title,
      subtitles,
    });
    if (error) console.error(error);
    else navigate(`/share/${shareId}`);
  };

  const updateSubtitle = (id, text) => {
    setSubtitleSlots(slots => slots.map(s => s.id === id ? { ...s, text } : s));
  };

  const clipDuration = clip ? clip.end_time - clip.start_time : 0;
  const progressPercent = clip && clipDuration > 0
    ? Math.min(100, Math.max(0, ((currentTime - clip.start_time) / clipDuration) * 100))
    : 0;

  return (
    <div className="editor">
      <div className="editor-header">
        <button className="back-button" onClick={() => navigate('/')}>← Retour</button>
        <input
          type="text"
          placeholder="Titre"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      {clip && (
        <div className="player-container">
          <div className="player-overlay-wrapper">
            <YouTube
              videoId={getYoutubeVideoId(clip.yt_url || clip.youtube_url)}
              onReady={onPlayerReady}
              onStateChange={handleStateChange}
              opts={{
                height: '520',
                width: '640',
                playerVars: {
                  start: Math.floor(clip.start_time),
                  controls: 0,
                  modestbranding: 1,
                  rel: 0,
                  disablekb: 1,
                  iv_load_policy: 3,
                  showinfo: 0,
                  autoplay: 0,
                },
              }}
            />
            <div className="click-overlay" onClick={togglePlay} />
            {isInSlot && (
              <div className="subtitle-overlay">{currentSubtitle}</div>
            )}
          </div>
          <div className="player-controls">
            <button className="play-pause-btn" onClick={togglePlay}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <div className="progress-bar-container" onClick={handleProgressClick}>
              <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="time-display">
              {formatTime(currentTime - clip.start_time)} / {formatTime(clipDuration)}
            </span>
          </div>
        </div>
      )}
      <div className="subtitles">
        <p className="subtitle-count">{subtitleSlots.length} zones de sous-titres à remplir</p>
        {subtitleSlots.map((slot, index) => (
          <div key={slot.id} className="subtitle-slot-row">
            <label>Sous-titre {index + 1}</label>
            <input
              type="text"
              placeholder={`Texte pour ${slot.start_time}s - ${slot.end_time}s`}
              value={slot.text || ''}
              onChange={(e) => updateSubtitle(slot.id, e.target.value)}
            />
          </div>
        ))}
      </div>
      <button onClick={handleSave}>Partager</button>
    </div>
  );
}

export default Editor;
