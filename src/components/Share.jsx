import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
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

function Share() {
  const { shareId } = useParams();
  const [share, setShare] = useState(null);
  const [clip, setClip] = useState(null);
  const [subtitleSlots, setSubtitleSlots] = useState([]);
  const [player, setPlayer] = useState(null);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [isInSlot, setIsInSlot] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef(null);
  const clipRef = useRef(null);
  const shareRef = useRef(null);
  const subtitleSlotsRef = useRef([]);

  useEffect(() => { clipRef.current = clip; }, [clip]);
  useEffect(() => { shareRef.current = share; }, [share]);
  useEffect(() => { subtitleSlotsRef.current = subtitleSlots; }, [subtitleSlots]);

  useEffect(() => {
    fetchShare();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [shareId]);

  const fetchShare = async () => {
    const { data, error } = await supabase.from('shares').select('*').eq('id', shareId).single();
    if (error) { console.error(error); return; }
    setShare(data);
    shareRef.current = data;
    fetchClipAndSlots(data.clip_id);
  };

  const fetchClipAndSlots = async (clipId) => {
    const [{ data: clipData, error: clipError }, { data: slotsData, error: slotsError }] = await Promise.all([
      supabase.from('clips').select('*').eq('id', clipId).single(),
      supabase.from('subtitle_slots').select('*').eq('clip_id', clipId).order('slot_order', { ascending: true }),
    ]);
    if (clipError) { console.error(clipError); return; }
    if (slotsError) { console.error(slotsError); return; }
    setClip(clipData);
    clipRef.current = clipData;
    setSubtitleSlots(slotsData);
    subtitleSlotsRef.current = slotsData;
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
        playerInstance.pauseVideo();
        playerInstance.seekTo(c.start_time);
        setCurrentTime(c.start_time);
        setIsPlaying(false);
        setCurrentSubtitle('');
        clearInterval(intervalRef.current);
        return;
      }
      setCurrentTime(raw);
      const activeSlot = subtitleSlotsRef.current.find(
        s => raw >= s.start_time && raw <= s.end_time
      );
      setIsInSlot(!!activeSlot);
      const subtitles = shareRef.current?.subtitles;
      setCurrentSubtitle(activeSlot && subtitles ? subtitles[activeSlot.id] || '' : '');
    }, 200);
  };

  const handleStateChange = (event) => {
    if (event.data === 1) {
      setIsPlaying(true);
      startPolling(event.target);
    } else if (event.data === 2 || event.data === 0) {
      setIsPlaying(false);
      setIsInSlot(false);
      setCurrentSubtitle('');
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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const clipDuration = clip ? clip.end_time - clip.start_time : 0;
  const progressPercent = clip && clipDuration > 0
    ? Math.min(100, Math.max(0, ((currentTime - clip.start_time) / clipDuration) * 100))
    : 0;

  if (!share || !clip) return <p>Chargement...</p>;

  return (
    <div className="share">
      <h1>{share.title}</h1>
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
              end: Math.ceil(clip.end_time),
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
      <div className="share-link">
        <span className="share-url">{window.location.href}</span>
        <button className="copy-link-btn" onClick={handleCopyLink}>
          {copied ? 'Copié !' : 'Copier le lien'}
        </button>
      </div>
    </div>
  );
}

export default Share;
