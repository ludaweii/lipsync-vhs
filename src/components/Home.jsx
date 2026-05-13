import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import YouTube from 'react-youtube';
import { supabase } from '../supabase';

const getYoutubeVideoId = (url) => {
  if (!url) return null;
  const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return match ? match[1] : null;
};

const getYoutubeThumbnail = (clip) => {
  const id = getYoutubeVideoId(clip.yt_url || clip.youtube_url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
};

function Home() {
  const navigate = useNavigate();
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClip, setSelectedClip] = useState(null);
  const [subtitleSlots, setSubtitleSlots] = useState([]);
  const [player, setPlayer] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInSlot, setIsInSlot] = useState(false);
  const intervalRef = useRef(null);
  const clipRef = useRef(null);
  const subtitleSlotsRef = useRef([]);
  const endedRef = useRef(false);

  useEffect(() => {
    fetchClips();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (clips.length > 0 && !selectedClip) selectClip(clips[0]);
  }, [clips]);

  const fetchClips = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('clips').select('*');
    if (error) console.error(error);
    else setClips(data);
    setLoading(false);
  };

  const selectClip = async (clip) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    endedRef.current = false;
    setIsPlaying(false);
    setIsInSlot(false);
    setPlayer(null);
    setSelectedClip(clip);
    clipRef.current = clip;

    const { data } = await supabase
      .from('subtitle_slots')
      .select('*')
      .eq('clip_id', clip.id)
      .order('slot_order', { ascending: true });
    setSubtitleSlots(data || []);
    subtitleSlotsRef.current = data || [];
  };

  const onPlayerReady = (event) => {
    setPlayer(event.target);
    const c = clipRef.current;
    if (c) {
      event.target.seekTo(c.start_time);
      event.target.pauseVideo();
    }
  };

  const startPolling = (playerInstance) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const c = clipRef.current;
      if (!c) return;
      const raw = playerInstance.getCurrentTime();
      if (raw >= c.end_time) {
        endedRef.current = true;
        playerInstance.pauseVideo();
        playerInstance.seekTo(c.start_time);
        setIsPlaying(false);
        setIsInSlot(false);
        clearInterval(intervalRef.current);
        return;
      }
      const activeSlot = subtitleSlotsRef.current.find(
        s => raw >= s.start_time && raw <= s.end_time
      );
      setIsInSlot(!!activeSlot);
    }, 200);
  };

  const handleStateChange = (event) => {
    if (event.data === 1) {
      if (endedRef.current) {
        endedRef.current = false;
        event.target.pauseVideo();
        return;
      }
      setIsPlaying(true);
      startPolling(event.target);
    } else if (event.data === 2 || event.data === 0) {
      setIsPlaying(false);
      setIsInSlot(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  const togglePlay = () => {
    if (!player) return;
    if (isPlaying) player.pauseVideo();
    else player.playVideo();
  };

  return (
    <div className="home">
      <div className="home-top">
        <h1 className="logo">new délice</h1>
        <Link to="/admin" className="admin-button">Admin</Link>
      </div>

      <div className="home-layout">
        <div className="home-clips">
          {loading ? (
            <p style={{ color: 'var(--gold-dim)' }}>Chargement...</p>
          ) : clips.length === 0 ? (
            <p style={{ color: 'var(--gold-dim)' }}>Aucune vidéo disponible pour l'instant</p>
          ) : (
            <div className="clips-grid">
              {clips.map(clip => (
                <div
                  key={clip.id}
                  className={`clip-card${selectedClip?.id === clip.id ? ' clip-card--active' : ''}`}
                  onClick={() => selectClip(clip)}
                >
                  {getYoutubeThumbnail(clip) && (
                    <img
                      src={getYoutubeThumbnail(clip)}
                      alt={clip.name || clip.title}
                      className="clip-thumbnail"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedClip && (
          <div className="home-preview">
            <div className="player-overlay-wrapper">
              <YouTube
                key={selectedClip.id}
                videoId={getYoutubeVideoId(selectedClip.yt_url || selectedClip.youtube_url)}
                onReady={onPlayerReady}
                onStateChange={handleStateChange}
                opts={{
                  height: '520',
                  width: '640',
                  playerVars: {
                    start: Math.floor(selectedClip.start_time),
                    end: Math.ceil(selectedClip.end_time),
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
            </div>
            <div className="home-preview-cta">
              <button
                className="cta-button"
                onClick={() => navigate(`/editor/${selectedClip.id}`)}
              >
                Commencer →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
