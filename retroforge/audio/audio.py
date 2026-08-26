"""AudioEngine — an 8-channel mixer in the spirit of the SNES SPC700.

Sound effects play on a pool of channels (0-6) with automatic free-channel
selection, while streaming music uses pygame's dedicated music channel so a long
track doesn't occupy a sample channel or sit in memory. Master/SFX/music volumes
are tracked separately so a game can offer the usual three sliders.

Initialisation is defensive: on headless systems without an audio device the
engine degrades to a no-op rather than crashing, so the same game code runs in
CI and on a desktop.
"""

from __future__ import annotations

import pygame

NUM_CHANNELS = 8
_MUSIC_RESERVED = 7  # channels 0..6 for SFX; 7 left free for stingers


class AudioEngine:
    def __init__(self, frequency: int = 44100, buffer: int = 512) -> None:
        self.available = False
        self._master = 1.0
        self._sfx_vol = 1.0
        self._music_vol = 1.0
        try:
            pygame.mixer.pre_init(frequency, -16, 2, buffer)
            pygame.mixer.init()
            pygame.mixer.set_num_channels(NUM_CHANNELS)
            self.available = True
        except pygame.error:
            self.available = False

    # -- sound effects --------------------------------------------------------
    def play_sfx(self, sound: "pygame.mixer.Sound | None", channel: int = -1,
                 volume: float = 1.0) -> "pygame.mixer.Channel | None":
        if not self.available or sound is None:
            return None
        sound.set_volume(volume * self._sfx_vol * self._master)
        if channel >= 0:
            ch = pygame.mixer.Channel(channel)
            ch.play(sound)
            return ch
        ch = pygame.mixer.find_channel()
        if ch is not None:
            ch.play(sound)
        return ch

    def play_sfx_panned(self, sound: "pygame.mixer.Sound | None", pan: float = 0.0,
                        volume: float = 1.0) -> "pygame.mixer.Channel | None":
        """Play with stereo placement: ``pan`` -1 is hard left, +1 hard right.

        Positioning effects relative to the player is most of what sells a wide
        stage, and it costs nothing but the per-channel volume pair.
        """
        if not self.available or sound is None:
            return None
        ch = pygame.mixer.find_channel()
        if ch is None:
            return None
        pan = -1.0 if pan < -1.0 else 1.0 if pan > 1.0 else pan
        gain = volume * self._sfx_vol * self._master
        left = gain * min(1.0, 1.0 - pan)
        right = gain * min(1.0, 1.0 + pan)
        sound.set_volume(1.0)
        ch.play(sound)
        ch.set_volume(left, right)
        return ch

    def stop_sfx(self) -> None:
        if self.available:
            pygame.mixer.stop()

    # -- music ----------------------------------------------------------------
    def play_music(self, path: str, loop: bool = True, fade_in_ms: int = 0,
                   start: float = 0.0) -> None:
        if not self.available:
            return
        try:
            pygame.mixer.music.load(path)
        except pygame.error:
            return
        pygame.mixer.music.set_volume(self._music_vol * self._master)
        pygame.mixer.music.play(-1 if loop else 0, start=start, fade_ms=fade_in_ms)

    def play_music_intro(self, intro_path: str, loop_path: str) -> None:
        """Play ``intro_path`` once, then loop ``loop_path`` forever.

        The standard 16-bit BGM shape: a run-up that plays once, then a body
        that repeats. pygame's music channel takes a queued follow-up track,
        which is exactly this.
        """
        if not self.available:
            return
        try:
            pygame.mixer.music.load(intro_path)
            pygame.mixer.music.queue(loop_path, loops=-1)
        except pygame.error:
            return
        pygame.mixer.music.set_volume(self._music_vol * self._master)
        pygame.mixer.music.play(0)

    def pause_music(self) -> None:
        if self.available:
            pygame.mixer.music.pause()

    def resume_music(self) -> None:
        if self.available:
            pygame.mixer.music.unpause()

    def is_music_playing(self) -> bool:
        return bool(self.available and pygame.mixer.music.get_busy())

    def stop_music(self, fade_out_ms: int = 500) -> None:
        if not self.available:
            return
        if fade_out_ms > 0:
            pygame.mixer.music.fadeout(fade_out_ms)
        else:
            pygame.mixer.music.stop()

    # -- volumes --------------------------------------------------------------
    def set_master_volume(self, v: float) -> None:
        self._master = _clamp01(v)
        if self.available:
            pygame.mixer.music.set_volume(self._music_vol * self._master)

    def set_sfx_volume(self, v: float) -> None:
        self._sfx_vol = _clamp01(v)

    def set_music_volume(self, v: float) -> None:
        self._music_vol = _clamp01(v)
        if self.available:
            pygame.mixer.music.set_volume(self._music_vol * self._master)


def _clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else 1.0 if v > 1.0 else v
