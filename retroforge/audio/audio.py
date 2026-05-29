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
    def play_sfx(self, sound: "pygame.mixer.Sound", channel: int = -1,
                 volume: float = 1.0) -> "pygame.mixer.Channel | None":
        if not self.available:
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

    # -- music ----------------------------------------------------------------
    def play_music(self, path: str, loop: bool = True, fade_in_ms: int = 0) -> None:
        if not self.available:
            return
        pygame.mixer.music.load(path)
        pygame.mixer.music.set_volume(self._music_vol * self._master)
        pygame.mixer.music.play(-1 if loop else 0, fade_ms=fade_in_ms)

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
