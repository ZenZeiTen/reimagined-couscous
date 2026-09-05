"""
Vassal's Edge - declarative model spec (v2 set).

One source of truth for two builders:
  * tools/bake_models.py         pure Python; bakes the spec straight to JSON/JS (runs anywhere)
  * tools/blender/build_models.py  bpy; builds the same parts as editable Blender objects and exports the same JSON

Units: millimetres, Y up, -Z forward (three.js convention). Every model is a dict of parts.
A part is { 'a': socket, 'c': colour key, 'prims': [primitive, ...] } where a primitive is one of

  ('box',   (w, h, d), (x, y, z), (rx, ry, rz))          rotations in degrees, Euler XYZ, applied before translation
  ('cyl',   r_top, r_bot, h, segments, (x, y, z), (rx, ry, rz))
  ('lathe', [(r, y), ...], segments, (x, y, z), (rx, ry, rz))   profile revolved around Y, closed top/bottom if r == 0 at ends
  ('blade', width, thick, length, tip, (x, y, z), (rx, ry, rz))  diamond-section blade along +Y with a tapered tip

Sockets follow the shared enemy rig: root, torso, pelvis, head, armL, armR, legL, legR (+ 'lid', 'arm' for props/NPCs).
Part coordinates are local to the socket. Arms hang from y=0 downward; legs from y=0 downward.
"""

R0 = (0, 0, 0)


def box(w, h, d, x=0, y=0, z=0, rot=R0):
    return ('box', (w, h, d), (x, y, z), rot)


def cyl(rt, rb, h, seg, x=0, y=0, z=0, rot=R0):
    return ('cyl', rt, rb, h, seg, (x, y, z), rot)


def lathe(profile, seg, x=0, y=0, z=0, rot=R0):
    return ('lathe', profile, seg, (x, y, z), rot)


def blade(width, thick, length, tip, x=0, y=0, z=0, rot=R0):
    return ('blade', width, thick, length, tip, (x, y, z), rot)


def part(a, c, *prims):
    return {'a': a, 'c': c, 'prims': list(prims)}


# ----------------------------------------------------------------------------------------------
# shared humanoid pieces (mariner-scale bodies)
# ----------------------------------------------------------------------------------------------
def humanoid(torso_c='armor', joint_c='joint', head_c='steel', scale=1.0, torso=(540, 470, 400), head=(300, 300, 300)):
    s = scale
    tw, th, td = [v * s for v in torso]
    hw, hh, hd = [v * s for v in head]
    return {
        'torso': part('torso', torso_c, box(tw, th, td, 0, 0, 0), box(tw * 0.55, th * 0.35, td * 0.4, 0, -th * 0.15, -td * 0.35)),
        'pelvis': part('pelvis', joint_c, box(tw * 0.75, 220 * s, td * 0.65)),
        'head': part('head', head_c, box(hw, hh, hd, 0, 20 * s, 0)),
        'armL': part('armL', torso_c, box(150 * s, 330 * s, 150 * s, 0, -165 * s, 0), box(130 * s, 320 * s, 130 * s, 0, -495 * s, 10 * s)),
        'armR': part('armR', torso_c, box(150 * s, 330 * s, 150 * s, 0, -165 * s, 0), box(130 * s, 320 * s, 130 * s, 0, -495 * s, 10 * s)),
        'legL': part('legL', joint_c, box(180 * s, 360 * s, 180 * s, 0, -180 * s, 0), box(160 * s, 380 * s, 160 * s, 0, -550 * s, -20 * s), box(170 * s, 60 * s, 280 * s, 0, -740 * s, -80 * s)),
        'legR': part('legR', joint_c, box(180 * s, 360 * s, 180 * s, 0, -180 * s, 0), box(160 * s, 380 * s, 160 * s, 0, -550 * s, -20 * s), box(170 * s, 60 * s, 280 * s, 0, -740 * s, -80 * s)),
    }


MODELS = {}

# ----------------------------------------------------------------------------------------------
# ENEMIES
# ----------------------------------------------------------------------------------------------
# Barnacle Crawler: a low, wide, crab-like thing. Torso socket sits at 0.45 m in the bestiary rig override.
MODELS['crawler'] = {
    'torso': part('torso', 'armor',
                  lathe([(0, -160), (380, -120), (470, 0), (400, 120), (180, 200), (0, 220)], 8),
                  cyl(40, 60, 90, 5, 180, 170, 60), cyl(35, 55, 80, 5, -140, 190, -40), cyl(30, 50, 70, 5, 60, 210, -190),
                  cyl(45, 65, 100, 5, -220, 120, 160)),
    'head': part('head', 'steel', box(220, 120, 160, 0, 0, -60), cyl(30, 30, 140, 5, -70, 60, -120, (30, 0, -20)), cyl(30, 30, 140, 5, 70, 60, -120, (30, 0, 20)),
                 box(50, 50, 50, -60, 130, -140), box(50, 50, 50, 60, 130, -140)),
    'armL': part('armL', 'armor', box(120, 120, 320, 0, -20, -160), box(90, 60, 260, -40, 10, -400), box(90, 60, 240, 40, -40, -390, (0, 0, 15))),
    'armR': part('armR', 'armor', box(120, 120, 320, 0, -20, -160), box(90, 60, 260, 40, 10, -400), box(90, 60, 240, -40, -40, -390, (0, 0, -15))),
    'legL': part('legL', 'joint', box(80, 80, 300, -60, -60, 0, (0, 35, 0)), box(60, 300, 60, -190, -200, 60), box(80, 80, 300, 60, -60, 120, (0, -35, 0)), box(60, 300, 60, 190, -200, 180)),
    'legR': part('legR', 'joint', box(80, 80, 300, 60, -60, 0, (0, -35, 0)), box(60, 300, 60, 190, -200, 60), box(80, 80, 300, -60, -60, 120, (0, 35, 0)), box(60, 300, 60, -190, -200, 180)),
}

# Hollow Bowman: a drowned archer. Bow in the left hand, quiver on the back.
_bow = humanoid(torso=(480, 440, 360), head=(260, 280, 260))
_bow['head']['prims'].append(box(300, 200, 300, 0, 120, 30))                     # hood
_bow['torso']['prims'].append(cyl(60, 60, 520, 6, 160, 60, 230, (20, 0, 0)))       # quiver
_bow['torso']['prims'].append(cyl(80, 60, 60, 6, 160, 320, 160, (20, 0, 0)))
_bow['armL']['prims'] += [cyl(22, 22, 700, 6, 0, -560, -160, (10, 0, 0)), cyl(18, 18, 420, 6, 0, -200, -80, (-25, 0, 0)), cyl(18, 18, 420, 6, 0, -920, -80, (25, 0, 0))]
MODELS['bowman'] = _bow

# Pale Wisp: a floating knot of quartz and cold. No legs; hovers.
MODELS['wisp'] = {
    'torso': part('torso', 'crystal', lathe([(0, -320), (150, -180), (240, 0), (170, 180), (0, 320)], 6),
                  lathe([(0, -90), (60, 0), (0, 90)], 4, 0, 360, 0), lathe([(0, -70), (50, 0), (0, 70)], 4, 220, -60, 120), lathe([(0, -70), (50, 0), (0, 70)], 4, -200, 80, -140)),
    'head': part('head', 'dark', lathe([(120, -30), (150, 0), (120, 30)], 8, 0, 0, 0), box(60, 60, 60, 0, 0, -120)),
    'armL': part('armL', 'crystal', cyl(15, 45, 520, 5, 0, -260, 0, (0, 0, -10)), cyl(10, 30, 360, 5, -120, -420, 60, (20, 0, 25))),
    'armR': part('armR', 'crystal', cyl(15, 45, 520, 5, 0, -260, 0, (0, 0, 10)), cyl(10, 30, 360, 5, 120, -420, 60, (20, 0, -25))),
}

# The Hollowed King: boss. Heavy plate, a crown grown into the skull, quartz through the chest, a moon greatsword.
_king = humanoid(torso=(640, 560, 460), head=(320, 340, 320), scale=1.0)
_king['torso']['prims'] += [cyl(0, 90, 360, 5, 160, 120, -240, (-40, 0, -25)), cyl(0, 70, 280, 5, -120, 200, -230, (-35, 0, 20)), cyl(0, 60, 220, 5, 40, -100, -250, (-60, 0, 0)),
                            box(700, 140, 520, 0, 260, 0)]                                               # gorget
_king['head']['prims'] += [lathe([(180, 150), (200, 200), (200, 260), (180, 270)], 8),
                           cyl(0, 40, 180, 4, 0, 350, 0), cyl(0, 35, 140, 4, 150, 320, 0), cyl(0, 35, 140, 4, -150, 320, 0), cyl(0, 35, 140, 4, 0, 320, 150), cyl(0, 35, 140, 4, 0, 320, -150)]
_king['armL']['prims'].append(lathe([(0, 0), (240, 40), (260, 120), (200, 200), (0, 220)], 8, 0, -20, 0))   # pauldron
_king['armR']['prims'].append(lathe([(0, 0), (240, 40), (260, 120), (200, 200), (0, 220)], 8, 0, -20, 0))
_king['sword'] = part('armR', 'blade', blade(110, 30, 1500, 380, 0, 0, 0), )
_king['guard'] = part('armR', 'steel', box(380, 60, 70, 0, -40, 0), box(60, 150, 60, 0, -190, 0), lathe([(0, -60), (60, -20), (60, 20), (0, 60)], 6, 0, -330, 0))
MODELS['king'] = _king

# ----------------------------------------------------------------------------------------------
# NPCs (single root-attached props; Garrick's hammer arm hangs off an 'arm' socket)
# ----------------------------------------------------------------------------------------------
MODELS['cinder'] = {
    'bench': part('root', 'iron', box(900, 450, 500, 0, 225, 0)),
    'robe': part('root', 'hilt', box(440, 700, 340, 0, 800, 20), box(480, 120, 300, 0, 1480, -20), box(140, 100, 420, -140, 500, -200), box(140, 100, 420, 140, 500, -200),
                 box(200, 260, 140, -110, 900, -200, (-30, 0, 0)), box(200, 260, 140, 110, 900, -200, (-30, 0, 0))),
    'head': part('root', 'bone', box(260, 300, 260, 0, 1300, 0)),
    'hood': part('root', 'hilt', box(300, 240, 200, 0, 1400, 80), box(300, 320, 40, 0, 1280, 160)),
    'hands': part('root', 'bone', box(120, 80, 120, -60, 1020, -150), box(120, 80, 120, 60, 1020, -150)),
}
MODELS['garrick'] = {
    'body': part('root', 'armor', box(620, 720, 360, 0, 1060, 0), box(200, 700, 200, -150, 350, 0), box(200, 700, 200, 150, 350, 0), box(160, 600, 160, -420, 1000, 150)),
    'apron': part('root', 'hilt', box(500, 640, 60, 0, 900, -200)),
    'head': part('root', 'bone', box(300, 320, 300, 0, 1600, 0), box(320, 80, 320, 0, 1460, 0)),
    'arm': part('arm', 'armor', box(160, 600, 160, 0, -300, 0)),
    'hammer': part('arm', 'wood', cyl(25, 25, 500, 6, 0, -600, 250), ),
    'hammerhead': part('arm', 'iron', box(140, 100, 240, 0, -850, 250)),
}
MODELS['anvil'] = {
    'stump': part('root', 'wood', cyl(250, 280, 600, 8, 0, 300, 0)),
    'anvil': part('root', 'iron', box(700, 220, 320, 0, 710, 0), cyl(0, 110, 300, 6, 450, 730, 0, (0, 0, -90)), box(300, 120, 260, 0, 560, 0)),
    'ore': part('root', 'dark', box(240, 120, 200, 200, 880, 40, (0, 20, 0)), box(180, 100, 160, -160, 870, -40, (0, -30, 0))),
}
# Old Mael, the Tide-Warden: a drowned lantern-keeper who trades for pearls. Stipple-rendered, half there.
MODELS['mael'] = {
    'robe': part('root', 'crystal', lathe([(0, 0), (380, 40), (300, 900), (220, 1350), (0, 1500)], 8), box(240, 300, 240, 0, 1650, 0), box(280, 120, 280, 0, 1760, 40)),
    'arm': part('root', 'crystal', box(120, 500, 120, 380, 1180, -60, (0, 0, -35)), box(110, 420, 110, -360, 1100, -80, (0, 0, 40))),
    'lantern': part('root', 'iron', cyl(90, 110, 220, 6, 560, 780, -140), cyl(20, 20, 140, 5, 560, 960, -140), cyl(60, 60, 30, 6, 560, 1040, -140)),
    'flame': part('root', 'crystal', lathe([(0, -60), (55, 0), (0, 80)], 5, 560, 790, -140)),
}
# Ser Aldous, a knight of the last watch, sitting against the cloister wall with his sword across his knees.
MODELS['aldous'] = {
    'body': part('root', 'armor', box(520, 560, 340, 0, 640, 0, (-15, 0, 0)), box(560, 120, 380, 0, 900, 20, (-15, 0, 0))),
    'legs': part('root', 'joint', box(170, 160, 700, -140, 160, -420), box(170, 160, 700, 140, 160, -420), box(180, 80, 240, -140, 220, -820), box(180, 80, 240, 140, 220, -820)),
    'arms': part('root', 'armor', box(130, 380, 130, -320, 620, -120, (-40, 0, 20)), box(130, 380, 130, 320, 620, -120, (-40, 0, -20))),
    'head': part('root', 'steel', box(280, 300, 280, 0, 1120, 60, (-10, 0, 0)), box(300, 80, 300, 0, 980, 60), box(60, 200, 60, 0, 1310, 60)),
    'sword': part('root', 'steel', blade(70, 20, 900, 200, 0, 380, -560, (0, 0, -90)), box(200, 40, 40, 0, 380, -560, (0, 0, -90))),
}
MODELS['bishop_corpse'] = {
    'robe': part('root', 'hilt', box(500, 800, 360, 0, 400, 0), box(240, 280, 240, 0, 940, 0)),
    'mitre': part('root', 'bone', lathe([(0, 0), (160, 20), (100, 380), (0, 420)], 4, 0, 1080, 0)),
    'hands': part('root', 'bone', box(140, 120, 140, -100, 720, -200), box(140, 120, 140, 100, 720, -200)),
}

# ----------------------------------------------------------------------------------------------
# WEAPONS (root-attached; +Y is the blade direction, grip below 0)
# ----------------------------------------------------------------------------------------------
MODELS['notched_falchion'] = {
    'blade': part('root', 'steel', blade(110, 22, 760, 180, 0, 90, 0), box(160, 120, 24, 30, 700, 0, (0, 0, -20)), box(60, 60, 26, -45, 480, 0, (0, 0, 45))),
    'guard': part('root', 'hilt', box(230, 46, 50, 0, 60, 0)),
    'grip': part('root', 'hilt', cyl(34, 30, 230, 6, 0, -80, 0), lathe([(0, -30), (45, 0), (0, 40)], 6, 0, -210, 0)),
}
MODELS['bell_maul'] = {
    'haft': part('root', 'wood', cyl(28, 32, 1100, 6, 0, 260, 0)),
    'head': part('root', 'iron', cyl(150, 150, 420, 8, 0, 820, 0, (0, 0, 90)), box(330, 120, 330, 0, 820, 0), cyl(40, 40, 60, 6, 0, 500, 0), cyl(40, 40, 60, 6, 0, -230, 0)),
    'bands': part('root', 'steel', cyl(160, 160, 40, 8, 190, 820, 0, (0, 0, 90)), cyl(160, 160, 40, 8, -190, 820, 0, (0, 0, 90))),
}
MODELS['warden_spear'] = {
    'shaft': part('root', 'wood', cyl(22, 26, 1700, 6, 0, 550, 0)),
    'head': part('root', 'blade', blade(90, 22, 420, 200, 0, 1400, 0)),
    'collar': part('root', 'steel', cyl(40, 30, 120, 6, 0, 1360, 0), cyl(30, 30, 60, 6, 0, -290, 0)),
}
MODELS['tide_dagger'] = {
    'blade': part('root', 'blade', blade(50, 14, 360, 110, 0, 60, 0)),
    'guard': part('root', 'steel', box(140, 26, 30, 0, 40, 0)),
    'grip': part('root', 'hilt', cyl(24, 20, 160, 6, 0, -55, 0), lathe([(0, -20), (30, 0), (0, 30)], 6, 0, -150, 0)),
}
MODELS['moon_greatsword'] = {
    'blade': part('root', 'blade', blade(120, 34, 1250, 320, 0, 170, 0)),
    'fuller': part('root', 'crystal', box(24, 900, 40, 0, 560, 0)),
    'guard': part('root', 'steel', box(160, 70, 60, -180, 130, 0, (0, 0, 25)), box(160, 70, 60, 180, 130, 0, (0, 0, -25)), box(120, 90, 70, 0, 120, 0)),
    'grip': part('root', 'hilt', cyl(36, 32, 380, 6, 0, -110, 0)),
    'pommel': part('root', 'sapphire', lathe([(0, -50), (55, -10), (55, 20), (0, 60)], 6, 0, -330, 0)),
}

# ----------------------------------------------------------------------------------------------
# ARMOUR pickups
# ----------------------------------------------------------------------------------------------
MODELS['horned_helm'] = {
    'shell': part('root', 'armor', lathe([(0, -150), (200, -140), (215, 20), (170, 140), (0, 160)], 8), box(280, 60, 60, 0, -120, -190)),
    'horns': part('root', 'bone', cyl(0, 40, 260, 5, 190, 90, 0, (0, 0, -60)), cyl(0, 40, 260, 5, -190, 90, 0, (0, 0, 60))),
}
MODELS['seer_hood'] = {
    'hood': part('root', 'hilt', lathe([(0, -180), (220, -170), (230, 60), (160, 180), (0, 200)], 6), box(260, 240, 60, 0, -60, 190)),
    'clasp': part('root', 'gold', lathe([(0, -20), (40, 0), (0, 20)], 5, 0, -150, -200)),
}
MODELS['warden_plate'] = {
    'chest': part('root', 'steel', box(560, 520, 300, 0, 0, 0), box(300, 200, 120, 0, 180, -180)),
    'pauldrons': part('root', 'iron', lathe([(0, 0), (200, 30), (210, 100), (150, 160), (0, 170)], 6, -340, 200, 0), lathe([(0, 0), (200, 30), (210, 100), (150, 160), (0, 170)], 6, 340, 200, 0)),
}
MODELS['greaves'] = {
    'shins': part('root', 'steel', box(150, 420, 120, -130, 0, 0), box(150, 420, 120, 130, 0, 0), box(170, 60, 240, -130, -240, -60), box(170, 60, 240, 130, -240, -60)),
}
MODELS['gauntlets'] = {
    'hands': part('root', 'iron', box(130, 90, 230, -110, 0, 0), box(130, 90, 230, 110, 0, 0), box(140, 40, 60, -110, 60, -60), box(140, 40, 60, 110, 60, -60)),
}
MODELS['bracers'] = {
    'bands': part('root', 'hilt', cyl(70, 80, 240, 6, -110, 0, 0), cyl(70, 80, 240, 6, 110, 0, 0)),
    'studs': part('root', 'steel', cyl(15, 20, 20, 5, -110, 40, -80, (90, 0, 0)), cyl(15, 20, 20, 5, 110, 40, -80, (90, 0, 0))),
}

# ----------------------------------------------------------------------------------------------
# ITEMS and KEY ITEMS
# ----------------------------------------------------------------------------------------------
MODELS['vial'] = {
    'glass': part('root', 'crystal', lathe([(0, 0), (70, 10), (80, 110), (40, 150), (30, 200), (0, 205)], 6)),
    'stopper': part('root', 'hilt', cyl(34, 30, 50, 6, 0, 215, 0)),
}
MODELS['bread'] = {'loaf': part('root', 'wood', lathe([(0, 0), (140, 10), (130, 70), (80, 110), (0, 120)], 6), box(120, 30, 30, 0, 110, 0, (0, 45, 0)))}
MODELS['ore'] = {'lump': part('root', 'dark', box(240, 180, 200, 0, 90, 0, (10, 20, 0)), box(180, 140, 160, 60, 170, -40, (0, -35, 15)), box(100, 90, 120, -110, 120, 50, (0, 40, 0))),
                 'vein': part('root', 'crystal', box(40, 200, 30, 20, 120, -100, (0, 10, 20)))}
MODELS['lens'] = {'glass': part('root', 'crystal', cyl(160, 160, 24, 10, 0, 0, 0, (90, 0, 0))),
                  'rim': part('root', 'gold', lathe([(150, -20), (185, -20), (185, 20), (150, 20)], 10, 0, 0, 0, (90, 0, 0)), box(40, 120, 30, 0, -230, 0))}
MODELS['clapper'] = {'rod': part('root', 'iron', cyl(28, 28, 320, 6, 0, 160, 0), lathe([(0, -70), (75, 0), (0, 70)], 6, 0, 0, 0)), 'loop': part('root', 'iron', lathe([(30, -15), (55, -15), (55, 15), (30, 15)], 8, 0, 340, 0, (90, 0, 0)))}
MODELS['seal'] = {'disc': part('root', 'gold', cyl(170, 170, 40, 12, 0, 0, 0), box(40, 30, 200, 0, 30, 0), box(200, 30, 40, 0, 30, 0), lathe([(0, 30), (60, 40), (0, 60)], 8))}
MODELS['signet'] = {'band': part('root', 'gold', lathe([(95, -25), (120, -25), (120, 25), (95, 25)], 12, 0, 0, 0, (90, 0, 0))), 'face': part('root', 'sapphire', box(110, 60, 90, 0, 0, -120))}
MODELS['pearl'] = {'orb': part('root', 'crystal', lathe([(0, -90), (65, -60), (90, 0), (65, 60), (0, 90)], 8))}
MODELS['salt'] = {'pouch': part('root', 'hilt', lathe([(0, 0), (110, 10), (120, 150), (60, 200), (70, 240), (0, 250)], 6)), 'tie': part('root', 'gold', cyl(65, 65, 25, 6, 0, 205, 0))}

# ----------------------------------------------------------------------------------------------
# PROPS
# ----------------------------------------------------------------------------------------------
MODELS['chest'] = {
    'body': part('root', 'wood', box(900, 460, 560, 0, 230, 0)),
    'bands': part('root', 'iron', box(60, 480, 580, -300, 235, 0), box(60, 480, 580, 300, 235, 0), box(120, 140, 40, 0, 380, -290)),
    'lid': part('lid', 'wood', box(920, 200, 580, 0, 100, 280)),
    'lidbands': part('lid', 'iron', box(60, 220, 600, -300, 100, 280), box(60, 220, 600, 300, 100, 280)),
}
MODELS['bones'] = {'pile': part('root', 'bone', cyl(30, 30, 420, 5, 0, 30, 0, (0, 20, 90)), cyl(28, 28, 360, 5, 60, 40, 120, (0, 70, 90)), cyl(25, 25, 300, 5, -80, 50, -60, (0, -40, 90)),
                                lathe([(0, -80), (90, -40), (100, 30), (60, 90), (0, 110)], 6, 120, 90, -100))}
MODELS['sconce'] = {'bracket': part('root', 'iron', box(60, 200, 120, 0, 0, 60), cyl(60, 90, 160, 6, 0, 120, 140)), 'flame': part('root', 'crystal', lathe([(0, -60), (50, 0), (0, 90)], 5, 0, 260, 140))}
MODELS['bell'] = {'bell': part('root', 'iron', lathe([(0, 0), (520, 40), (420, 300), (300, 700), (200, 900), (0, 940)], 10)), 'clapper': part('root', 'dark', cyl(30, 30, 500, 5, 0, 400, 0), lathe([(0, -80), (80, 0), (0, 80)], 6, 0, 120, 0))}
MODELS['cage'] = {'bars': part('root', 'iron', *[cyl(20, 20, 1900, 5, 380 * __import__('math').cos(i * 0.785), 950, 380 * __import__('math').sin(i * 0.785)) for i in range(8)],
                               cyl(410, 410, 50, 8, 0, 25, 0), cyl(410, 410, 50, 8, 0, 1900, 0))}
MODELS['moongate'] = {
    'arch': part('root', 'crystal', box(500, 4200, 500, -1600, 2100, 0), box(500, 4200, 500, 1600, 2100, 0), box(3700, 500, 500, 0, 4450, 0)),
    'runes': part('root', 'sapphire', box(120, 300, 60, -1600, 1200, -280), box(120, 300, 60, 1600, 1200, -280), box(120, 300, 60, -1600, 2400, -280), box(120, 300, 60, 1600, 2400, -280), box(300, 120, 60, 0, 4450, -280)),
    'keystone': part('root', 'crystal', lathe([(0, -200), (260, -60), (260, 60), (0, 200)], 6, 0, 4450, -100)),
}
