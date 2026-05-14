import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import YouTube from 'react-youtube';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { supabase } from '../supabase';

const toTimeStr = (secs) => {
  const total = Math.max(0, Math.round(secs));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m},${String(s).padStart(2, '0')}`;
};

const fromTimeStr = (str) => {
  const parts = String(str).split(',');
  const m = parseInt(parts[0], 10) || 0;
  const s = parseInt(parts[1] || '0', 10) || 0;
  return m * 60 + Math.min(59, s);
};

function Admin() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [step, setStep] = useState(1);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [clipName, setClipName] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [startTimeStr, setStartTimeStr] = useState('0,00');
  const [endTime, setEndTime] = useState(100);
  const [endTimeStr, setEndTimeStr] = useState('0,00');
  const [duration, setDuration] = useState(100);
  const [subtitleSlots, setSubtitleSlots] = useState([]);
  const [player, setPlayer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [clips, setClips] = useState([]);
  const [slotCounts, setSlotCounts] = useState({});
  const [editingClipId, setEditingClipId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSlotLabel, setActiveSlotLabel] = useState('');
  const progressIntervalRef = useRef(null);
  const subtitleSlotsRef = useRef([]);
  const navigate = useNavigate();

  useEffect(() => { subtitleSlotsRef.current = subtitleSlots; }, [subtitleSlots]);

  useEffect(() => {
    if (authenticated && step === 1) {
      fetchClips();
    }
  }, [authenticated, step]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const handlePassword = () => {
    if (password === 'admin123') setAuthenticated(true);
  };

  const fetchClips = async () => {
    const { data, error } = await supabase.from('clips').select('*').order('created_at', { ascending: false });
    if (error) console.error(error);
    else {
      setClips(data);
      data.forEach(clip => fetchSlotCount(clip.id));
    }
  };

  const fetchSlotCount = async (clipId) => {
    const { data, error } = await supabase.from('subtitle_slots').select('id').eq('clip_id', clipId);
    if (error) console.error(error);
    else setSlotCounts(prev => ({ ...prev, [clipId]: data.length }));
  };

  const loadClipForEdit = async (clip) => {
    setEditingClipId(clip.id);
    setYoutubeUrl(clip.yt_url || clip.youtube_url);
    const urlMatch = (clip.yt_url || clip.youtube_url).match(/([a-zA-Z0-9_-]{11})/);
    setVideoId(urlMatch ? urlMatch[1] : '');
    setClipName(clip.name);
    setStartTime(clip.start_time);
    setStartTimeStr(toTimeStr(clip.start_time));
    setEndTime(clip.end_time);
    setEndTimeStr(toTimeStr(clip.end_time));
    const { data: slots } = await supabase.from('subtitle_slots').select('*').eq('clip_id', clip.id).order('slot_order', { ascending: true });
    setSubtitleSlots(slots || []);
    setStep(2);
  };

  const deleteClip = async (clipId) => {
    if (confirm('Etes-vous sur de vouloir supprimer ce clip et ses sous-titres ?')) {
      await supabase.from('subtitle_slots').delete().eq('clip_id', clipId);
      await supabase.from('clips').delete().eq('id', clipId);
      fetchClips();
    }
  };

  const validateUrl = () => {
    const match = youtubeUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (match) {
      setVideoId(match[1]);
      setEditingClipId(null);
      setClipName('');
      setStartTime(0);
      setStartTimeStr('0,00');
      setEndTime(100);
      setEndTimeStr('0,00');
      setSubtitleSlots([]);
      setStep(2);
    } else {
      alert('URL YouTube invalide');
    }
  };

  const onPlayerReady = (event) => {
    setPlayer(event.target);
    event.target.seekTo(startTime);
    const dur = event.target.getDuration();
    setDuration(dur);
    if (!editingClipId) {
      setEndTime(dur);
      setEndTimeStr(toTimeStr(dur));
    }
  };

  const onPlayerStateChange = (event) => {
    const state = event.data;
    if (state === YouTube.PlayerState.PLAYING) {
      setIsPlaying(true);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = setInterval(() => {
        if (event.target) {
          const currentTime = event.target.getCurrentTime();
          setCurrentTime(currentTime);
          const activeIndex = subtitleSlotsRef.current.findIndex(
            s => currentTime >= s.start_time && currentTime <= s.end_time
          );
          setActiveSlotLabel(activeIndex >= 0 ? `Sous-titre ${activeIndex + 1}` : '');
          if (currentTime >= endTime) {
            event.target.seekTo(startTime, true);
            event.target.pauseVideo();
            setIsPlaying(false);
            setActiveSlotLabel('');
            setCurrentTime(startTime);
            clearInterval(progressIntervalRef.current);
          }
        }
      }, 100);
    } else {
      setIsPlaying(false);
      setActiveSlotLabel('');
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }
  };

  const togglePlayPause = () => {
    if (!player) return;
    if (isPlaying) {
      player.pauseVideo();
      setIsPlaying(false);
    } else {
      player.playVideo();
      setIsPlaying(true);
    }
  };

  const handleProgressChange = (value) => {
    if (player) {
      const seekTime = startTime + value;
      player.seekTo(seekTime);
      setCurrentTime(seekTime);
    }
  };

  const addSubtitleSlot = () => {
    setSubtitleSlots([...subtitleSlots, { start_time: 0, end_time: 10 }]);
  };

  const updateSlot = (index, field, value) => {
    const newSlots = [...subtitleSlots];
    newSlots[index][field] = value;
    setSubtitleSlots(newSlots);
  };

  const removeSlot = (index) => {
    setSubtitleSlots(subtitleSlots.filter((_, i) => i !== index));
  };

  const saveClip = async () => {
    setSaving(true);
    setMessage('');
    setErrorMessage('');

    try {
      let clipId = editingClipId;

      if (editingClipId) {
        const { error } = await supabase.from('clips').update({
          youtube_url: youtubeUrl,
          yt_url: youtubeUrl,
          start_time: startTime,
          end_time: endTime,
          name: clipName
        }).eq('id', editingClipId);

        if (error) {
          setErrorMessage('Erreur clip : ' + error.message);
          return;
        }

        await supabase.from('subtitle_slots').delete().eq('clip_id', editingClipId);
      } else {
        const { data, error } = await supabase.from('clips').insert({
          youtube_url: youtubeUrl,
          yt_url: youtubeUrl,
          start_time: startTime,
          end_time: endTime,
          title: 'Nouveau clip',
          name: clipName
        }).select().single();

        if (error) {
          setErrorMessage('Erreur clip : ' + error.message);
          return;
        }

        clipId = data.id;
      }

      const slotsWithClipId = subtitleSlots.map((slot, index) => ({
        clip_id: clipId,
        start_time: slot.start_time,
        end_time: slot.end_time,
        slot_order: index + 1
      }));

      if (slotsWithClipId.length > 0) {
        const { error: subtitleError } = await supabase.from('subtitle_slots').insert(slotsWithClipId);

        if (subtitleError) {
          setErrorMessage('Erreur sous-titres : ' + subtitleError.message);
          return;
        }
      }

      setMessage('Enregistrement reussi !');
      setEditingClipId(null);
      setYoutubeUrl('');
      setClipName('');
      setStartTime(0);
      setStartTimeStr('0,00');
      setEndTime(100);
      setEndTimeStr('0,00');
      setSubtitleSlots([]);
      setStep(1);
      fetchClips();
    } catch (err) {
      setErrorMessage('Erreur inattendue : ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="admin">
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handlePassword}>Entrer</button>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="admin">
        <div className="admin-header">
          <h1 className="logo">Admin</h1>
          <button className="view-site-btn" onClick={() => navigate('/')}>Voir le site</button>
        </div>
        <section className="new-clip-section">
          <h2>Creer un nouvel extrait</h2>
          <input
            type="text"
            placeholder="URL YouTube"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
          />
          <button onClick={validateUrl}>Valider</button>
        </section>

        <section className="clips-list-section">
          <h2>Extraits enregistres</h2>
          {clips.length === 0 ? (
            <p>Aucun extrait pour l'instant</p>
          ) : (
            <div className="clips-table">
              {clips.map(clip => (
                <div key={clip.id} className="clip-row">
                  <div className="clip-info">
                    <strong>{clip.name}</strong>
                    <p>Duree: {(clip.end_time - clip.start_time).toFixed(1)}s | Slots: {slotCounts[clip.id] || 0}</p>
                  </div>
                  <div className="clip-actions">
                    <button onClick={() => loadClipForEdit(clip)} className="modify-btn">Modifier</button>
                    <button onClick={() => deleteClip(clip.id)} className="delete-btn">Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="admin">
      <div className="admin-header">
        <button className="back-btn" onClick={() => {
          setStep(1);
          setEditingClipId(null);
          setYoutubeUrl('');
          setVideoId('');
          setClipName('');
          setStartTime(0);
          setStartTimeStr('0,00');
          setEndTime(100);
          setEndTimeStr('0,00');
          setSubtitleSlots([]);
        }}>Retour</button>
        <h1>Admin - Etape 2 {editingClipId && '(Modification)'}</h1>
        <button className="view-site-btn" onClick={() => navigate('/')}>Voir le site</button>
      </div>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <YouTube
          videoId={videoId}
          onReady={onPlayerReady}
          onStateChange={onPlayerStateChange}
          opts={{
            height: '600',
            width: '900',
            playerVars: {
              modestbranding: 1,
              rel: 0,
              controls: 0,
              disablekb: 1,
              iv_load_policy: 3,
              start: Math.floor(startTime)
            }
          }}
        />
        {activeSlotLabel && (
          <div className="subtitle-overlay">{activeSlotLabel}</div>
        )}
      </div>
      <div className="player-controls">
        <button className="play-pause-btn" onClick={togglePlayPause}>
          {isPlaying ? 'Pause' : 'Jouer'}
        </button>
        <div className="progress-bar-container">
          <div 
            className="progress-bar"
            style={{
              width: `${((currentTime - startTime) / (endTime - startTime)) * 100}%`
            }}
          />
          <input
            type="range"
            min="0"
            max={endTime - startTime}
            value={currentTime - startTime}
            onChange={(e) => handleProgressChange(parseFloat(e.target.value))}
            className="progress-slider"
          />
        </div>
        <span className="time-display">
          {toTimeStr(currentTime)} / {toTimeStr(endTime)}
        </span>
      </div>
      <div>
        <label>Nom de l'extrait</label>
        <input
          type="text"
          placeholder="Nom de l'extrait"
          value={clipName}
          onChange={(e) => setClipName(e.target.value)}
        />
      </div>
      <div className="time-inputs-section">
        <div className="time-input-row">
          <label>Début</label>
          <input
            type="text"
            className="time-input"
            value={startTimeStr}
            onChange={(e) => setStartTimeStr(e.target.value)}
            onBlur={(e) => {
              const secs = Math.max(0, Math.min(fromTimeStr(e.target.value), duration));
              setStartTime(secs);
              setStartTimeStr(toTimeStr(secs));
            }}
            placeholder="0,00"
          />
          <Slider
            min={0}
            max={duration}
            value={startTime}
            onChange={(val) => { setStartTime(val); setStartTimeStr(toTimeStr(val)); }}
          />
        </div>
        <div className="time-input-row">
          <label>
            Fin
            {duration > 0 && Math.abs(endTime - duration) < 1 && (
              <span style={{ color: 'rgba(249,100,100,0.9)', marginLeft: 8, fontSize: 12 }}>
                ⚠️ fin = durée totale
              </span>
            )}
          </label>
          <input
            type="text"
            className="time-input"
            value={endTimeStr}
            onChange={(e) => setEndTimeStr(e.target.value)}
            onBlur={(e) => {
              const secs = Math.max(0, Math.min(fromTimeStr(e.target.value), duration));
              setEndTime(secs);
              setEndTimeStr(toTimeStr(secs));
            }}
            placeholder="0,00"
          />
          <Slider
            min={0}
            max={duration}
            value={endTime}
            onChange={(val) => { setEndTime(val); setEndTimeStr(toTimeStr(val)); }}
          />
        </div>
      </div>
      <button onClick={addSubtitleSlot}>Ajouter slot sous-titre</button>
      {subtitleSlots.map((slot, index) => (
        <div key={index} className="slot-row">
          <input
            type="text"
            placeholder="0,00"
            defaultValue={toTimeStr(slot.start_time || 0)}
            onBlur={(e) => updateSlot(index, 'start_time', fromTimeStr(e.target.value))}
          />
          <input
            type="text"
            placeholder="0,00"
            defaultValue={toTimeStr(slot.end_time || 0)}
            onBlur={(e) => updateSlot(index, 'end_time', fromTimeStr(e.target.value))}
          />
          <button className="slot-remove-btn" onClick={() => removeSlot(index)}>✕</button>
        </div>
      ))}
      <button onClick={saveClip} disabled={saving}>
        {saving ? 'Sauvegarde en cours...' : 'Sauvegarder'}
      </button>
      {message && <div className="status-message">{message}</div>}
      {errorMessage && <div className="error-message">{errorMessage}</div>}
    </div>
  );
}

export default Admin;
