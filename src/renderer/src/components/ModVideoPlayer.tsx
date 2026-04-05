import { useEffect, useRef, useState } from "react";

export function ModVideoPlayer(rawProps: React.VideoHTMLAttributes<HTMLVideoElement>): React.JSX.Element {
    const cleaned = { ...rawProps } as Record<string, unknown>;
    delete cleaned.node;
    const { src, ...props } = cleaned as React.VideoHTMLAttributes<HTMLVideoElement>;
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [loading, setLoading] = useState(true);

    const togglePlay = (): void => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) {
            v.play();
            setPlaying(true);
        } else {
            v.pause();
            setPlaying(false);
        }
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>): void => {
        const v = videoRef.current;
        if (!v || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        v.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
    };

    const formatTime = (s: number): string => {
        const m = Math.floor(s / 60);
        return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
    };

    const progress = duration ? (currentTime / duration) * 100 : 0;

    return (
        <div className={`mod-video-player${playing ? " mod-video-player--playing" : ""}`}>
            {loading && <div className="mod-video-skeleton" />}
            <video
                ref={videoRef}
                className="mod-video-element"
                src={src}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                onLoadedData={() => setLoading(false)}
                onEnded={() => setPlaying(false)}
                onClick={togglePlay}
                {...props}
                controls={false}
            />
            <div className="mod-video-controls">
                <div className="mod-video-play-btn" onClick={togglePlay}>
                    {playing ? (
                        <svg width="10" height="12" viewBox="0 0 10 12">
                            <rect x="0" y="0" width="3" height="12" fill="white" />
                            <rect x="7" y="0" width="3" height="12" fill="white" />
                        </svg>
                    ) : (
                        <svg width="10" height="12" viewBox="0 0 10 12">
                            <polygon points="0,0 10,6 0,12" fill="white" />
                        </svg>
                    )}
                </div>
                <div className="mod-video-progress-track" onClick={handleProgressClick}>
                    <div className="mod-video-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="minecraft-seven mod-video-time">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </span>
            </div>
        </div>
    );
}
