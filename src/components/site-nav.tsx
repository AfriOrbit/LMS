import Link from 'next/link';

import { getSessionContext } from '@/lib/auth';
import { publicEnv } from '@/lib/env';
import { ButtonLink } from '@/components/ui/primitives';
import { HOME_LABEL, HOME_PATH, MAIN_SITE_LABEL, MAIN_SITE_URL } from '@/lib/site-config';
import { ThemeToggle } from '@/components/theme';
import { cn } from '@/lib/utils';

/**
 * The AfriOrbit mark.
 *
 * Vectorised from the brand raster with potrace and normalised to
 * `fill="currentColor"`. This replaces a placeholder that was drawn in code —
 * a circle, an ellipse and a dot — and had nothing to do with the brand. The
 * website renders the identical paths, so the two properties now show one
 * logo rather than two that merely both say "AfriOrbit".
 *
 * `currentColor` is what makes it work in both registers: black in the light
 * public header, white in the dark application shell, one component.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1296 1224"
      className={cn("shrink-0", className)}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(0.000000,1224.000000) scale(0.100000,-0.100000)"
fill="currentColor" stroke="none">
<path d="M11290 12219 c-36 -10 -117 -27 -180 -39 -113 -20 -200 -42 -330 -80
-155 -46 -207 -62 -235 -72 -16 -5 -57 -18 -90 -27 -33 -10 -70 -23 -82 -29
-12 -7 -29 -12 -38 -12 -9 0 -31 -7 -48 -15 -30 -13 -54 -22 -147 -55 -19 -7
-55 -21 -80 -31 -25 -10 -81 -32 -125 -50 -44 -17 -102 -40 -130 -49 -59 -21
-209 -85 -247 -105 -14 -8 -31 -15 -37 -15 -25 0 -798 -384 -846 -420 -5 -4
-55 -31 -110 -60 -55 -29 -122 -65 -150 -80 -27 -15 -81 -44 -120 -65 -96 -52
-106 -58 -135 -76 -14 -9 -88 -53 -165 -99 -77 -46 -147 -89 -155 -96 -26 -22
-131 -54 -199 -60 -53 -5 -81 -15 -145 -52 l-78 -45 -58 11 c-32 6 -91 26
-131 45 -133 63 -158 70 -274 74 -93 4 -115 8 -146 28 -43 28 -119 55 -157 56
-15 0 -54 10 -87 23 -46 17 -63 29 -75 54 -12 24 -28 36 -75 53 -128 48 -223
32 -328 -54 -80 -66 -85 -84 -61 -229 8 -46 -21 -97 -74 -133 -55 -37 -83 -32
-176 30 -45 30 -87 55 -94 55 -7 0 -27 7 -45 16 -17 10 -66 20 -109 25 -81 8
-110 21 -170 77 -25 24 -39 47 -43 73 -5 28 -15 44 -44 63 -20 14 -42 26 -49
26 -6 0 -31 8 -54 19 -99 43 -153 55 -253 55 -83 1 -106 5 -135 22 -20 11 -48
24 -63 28 -15 3 -44 21 -65 39 -20 18 -55 39 -77 45 -22 7 -51 20 -64 30 -37
30 -26 50 84 145 22 19 50 54 62 77 20 40 20 46 7 83 -8 22 -26 55 -39 73 -17
22 -25 45 -25 73 0 34 5 44 35 67 26 19 35 34 35 55 0 34 -25 39 -65 13 -24
-16 -25 -15 -42 14 -34 59 -112 69 -203 26 -54 -25 -59 -25 -245 -23 -170 3
-194 1 -225 -15 -30 -17 -61 -19 -235 -21 -166 -1 -207 -4 -240 -19 -24 -11
-78 -20 -135 -23 -100 -6 -122 -14 -235 -81 -33 -20 -96 -49 -140 -64 -57 -20
-89 -38 -110 -62 -43 -48 -80 -67 -141 -73 -40 -4 -60 -2 -79 11 -21 14 -54
18 -169 20 l-144 2 -50 42 c-38 32 -58 42 -86 42 -32 0 -38 -4 -56 -42 -12
-24 -25 -65 -30 -91 -10 -49 -80 -165 -123 -204 -25 -23 -76 -50 -162 -88 -63
-28 -136 -91 -162 -139 -8 -15 -20 -47 -27 -71 -8 -23 -30 -68 -51 -99 -35
-52 -37 -60 -36 -133 0 -43 4 -91 9 -108 17 -58 -34 -166 -111 -231 -98 -84
-190 -140 -279 -170 -93 -31 -93 -31 -130 -90 -20 -32 -39 -71 -43 -86 -6 -25
-39 -59 -115 -117 -36 -27 -90 -139 -90 -186 0 -23 -12 -48 -38 -82 -59 -75
-122 -168 -122 -180 0 -5 -8 -21 -18 -34 -10 -13 -30 -57 -46 -96 -17 -45 -39
-82 -57 -97 -34 -29 -59 -91 -59 -148 0 -35 7 -47 49 -90 46 -47 70 -95 57
-116 -3 -5 -6 -40 -7 -78 -1 -55 3 -77 21 -107 20 -34 22 -48 18 -120 -3 -45
-13 -107 -21 -137 -43 -150 -57 -207 -57 -231 0 -32 -50 -111 -89 -140 -17
-13 -31 -29 -31 -37 0 -8 18 -34 39 -57 50 -54 69 -113 53 -159 -13 -35 -15
-130 -4 -158 8 -18 70 -66 120 -92 40 -21 63 -20 101 1 23 14 33 15 42 6 17
-17 2 -33 -32 -33 -25 0 -29 -4 -29 -29 0 -21 10 -38 35 -60 20 -17 40 -31 45
-31 15 0 70 -64 70 -81 0 -9 21 -34 47 -55 96 -79 126 -124 146 -222 7 -32 22
-70 34 -85 34 -44 112 -101 189 -140 46 -23 83 -50 104 -77 18 -22 49 -49 69
-59 20 -11 68 -47 106 -81 85 -74 213 -160 240 -160 11 0 40 -9 64 -20 65 -30
108 -26 205 20 47 22 98 40 113 40 16 0 54 9 86 20 82 29 253 28 331 -1 36
-14 56 -27 56 -38 0 -9 -31 -47 -68 -86 -143 -148 -385 -428 -550 -634 -37
-46 -92 -114 -122 -150 -133 -158 -301 -374 -492 -630 -81 -108 -478 -702
-478 -715 0 -3 -27 -48 -60 -101 -33 -53 -60 -99 -60 -102 0 -3 -16 -30 -35
-59 -51 -76 -55 -77 -330 -25 -22 4 -54 15 -72 24 -18 9 -38 17 -46 17 -8 0
-39 11 -70 25 -86 40 -102 21 -72 -79 28 -91 40 -263 27 -388 -12 -121 -76
-342 -107 -364 -8 -6 -15 -23 -15 -38 0 -22 4 -26 28 -26 15 0 49 7 76 15 54
16 142 20 150 6 6 -8 -5 -45 -34 -121 -97 -250 -141 -399 -174 -595 -14 -82
-30 -166 -36 -185 -16 -56 -13 -336 4 -368 8 -15 19 -61 25 -102 9 -68 26
-119 76 -234 24 -56 121 -180 196 -252 98 -93 139 -118 326 -200 17 -8 39 -14
50 -14 10 0 45 -9 78 -19 126 -41 449 -62 640 -41 61 6 155 15 210 20 55 5
125 16 155 24 30 9 71 16 91 16 20 0 62 9 94 20 32 11 69 20 82 20 12 0 51 9
85 20 35 11 92 29 128 40 249 74 521 167 607 206 17 8 37 14 45 14 7 1 31 9
53 20 22 11 46 19 52 20 7 0 32 9 55 19 24 10 66 28 93 39 134 54 203 83 286
121 25 12 49 21 52 21 5 0 581 279 627 304 14 8 75 39 135 71 115 60 523 292
660 375 44 27 90 49 102 50 20 0 63 -45 63 -67 0 -5 16 -33 37 -63 52 -79 62
-113 63 -222 0 -100 7 -143 41 -258 11 -36 19 -93 19 -127 0 -36 8 -84 19
-115 11 -29 22 -77 25 -105 4 -29 16 -74 26 -99 23 -54 98 -151 138 -181 16
-12 44 -45 63 -75 35 -54 89 -177 89 -202 0 -22 80 -193 123 -263 29 -48 39
-76 44 -125 5 -60 4 -66 -21 -93 -35 -38 -33 -62 14 -131 22 -33 40 -71 40
-85 0 -32 29 -59 104 -95 32 -16 61 -34 63 -41 8 -19 109 -17 117 2 8 22 49
35 138 45 50 6 94 18 127 35 50 27 53 27 193 21 233 -11 236 -11 335 10 12 2
32 14 43 26 15 16 37 24 90 29 38 4 88 16 112 27 63 28 255 199 318 284 30 40
79 100 110 133 31 33 76 92 99 132 23 40 49 77 57 84 8 6 14 16 14 21 0 24
106 161 150 192 27 19 57 47 66 61 19 29 49 159 66 283 11 78 10 84 -10 112
-12 16 -22 35 -22 41 0 21 44 79 64 85 10 3 46 24 80 45 36 23 73 39 92 39 17
0 55 12 85 28 64 32 92 79 95 157 1 28 7 81 14 120 21 117 5 194 -76 361 -56
116 -53 126 72 247 59 56 119 107 135 114 16 7 35 25 41 40 19 42 99 118 154
146 27 14 87 37 133 53 77 26 91 35 160 104 93 92 137 155 162 233 23 73 24
89 2 130 -26 49 -31 304 -9 397 14 56 15 74 5 92 -12 22 -41 63 -186 266 -35
48 -77 108 -95 133 -100 141 -140 191 -208 259 -65 64 -89 81 -170 116 -174
76 -172 76 -543 75 -355 -2 -343 0 -500 -59 -118 -44 -225 -151 -417 -416 -30
-42 -75 -103 -100 -136 -25 -33 -90 -121 -145 -196 -102 -138 -142 -174 -198
-174 -32 0 -86 38 -114 79 l-23 34 0 615 0 614 25 102 c31 127 55 190 104 271
61 99 125 178 201 247 41 36 74 74 79 92 5 17 15 139 21 271 16 349 70 688
171 1082 21 83 39 157 39 165 0 7 7 27 16 43 8 17 19 48 24 70 8 36 63 205 91
280 6 17 18 48 25 70 8 22 21 54 28 70 8 17 24 57 36 90 12 33 48 115 81 183
32 68 59 127 59 132 0 9 61 128 122 235 18 33 48 89 66 125 18 36 44 83 58
105 13 22 28 49 33 61 5 11 32 41 59 65 43 39 60 47 119 58 58 10 78 10 127
-3 93 -25 151 -81 216 -211 11 -22 38 -71 60 -110 58 -100 260 -506 260 -522
0 -7 9 -30 20 -50 11 -21 20 -45 20 -53 0 -8 9 -28 20 -45 11 -16 20 -38 20
-48 0 -9 9 -34 20 -54 11 -21 20 -44 20 -51 0 -8 7 -28 15 -45 8 -18 21 -54
29 -82 7 -27 18 -63 24 -80 34 -103 45 -135 57 -180 51 -189 68 -256 76 -304
5 -29 14 -61 19 -71 8 -16 24 -97 55 -291 7 -48 19 -105 25 -128 6 -22 15 -98
20 -168 6 -71 15 -168 21 -218 6 -49 14 -161 17 -247 l7 -157 91 -85 c79 -73
129 -136 198 -248 26 -43 55 -36 94 20 37 54 364 359 427 397 22 13 50 25 63
25 38 0 330 301 396 408 30 48 69 98 86 111 19 13 42 46 57 80 13 31 41 92 62
136 21 44 41 93 45 109 8 33 63 121 114 184 27 34 37 57 44 102 11 86 58 175
141 271 92 107 99 115 139 165 148 185 321 403 336 424 11 14 65 86 120 160
56 74 125 166 154 203 29 38 60 81 70 95 9 15 42 63 73 107 104 149 302 451
337 514 24 43 59 54 153 47 122 -8 268 -48 357 -97 10 -5 36 -15 58 -23 59
-20 68 -4 41 74 -12 33 -21 77 -21 98 0 22 -7 61 -15 88 -17 56 -20 187 -5
230 6 16 14 58 19 94 12 83 45 179 97 283 8 16 12 33 8 38 -8 13 -53 11 -99
-6 -53 -19 -121 -19 -128 -1 -3 8 17 66 45 128 65 148 74 167 86 203 21 62 35
101 52 145 31 82 42 114 60 180 10 36 22 76 28 90 15 36 50 215 56 287 3 35
13 79 21 99 22 52 22 382 0 424 -8 16 -19 57 -24 92 -5 35 -18 86 -28 113 -54
149 -191 330 -317 419 -97 69 -320 166 -381 166 -11 0 -38 9 -60 20 -37 19
-58 20 -410 19 -325 -1 -378 -4 -435 -20z m790 -84 c150 -34 217 -57 329 -112
203 -99 332 -251 404 -473 67 -205 69 -465 6 -755 -37 -168 -56 -242 -79 -310
-10 -27 -23 -65 -29 -82 -28 -81 -35 -101 -52 -139 -11 -23 -19 -47 -19 -54 0
-6 -7 -24 -15 -38 -8 -15 -28 -61 -46 -102 -96 -232 -110 -250 -183 -250 -108
1 -251 33 -361 80 -126 55 -141 52 -125 -26 5 -27 17 -85 26 -129 25 -121 29
-247 10 -319 -8 -34 -20 -83 -25 -111 -5 -27 -21 -79 -35 -115 -13 -36 -33
-86 -43 -112 -23 -62 -12 -77 45 -60 22 7 58 12 81 12 39 0 42 -2 36 -22 -4
-13 -23 -48 -43 -78 -21 -30 -41 -63 -47 -72 -5 -10 -55 -83 -110 -163 -55
-81 -109 -161 -120 -179 -22 -35 -228 -312 -310 -416 -229 -290 -489 -611
-518 -639 l-35 -33 -29 21 c-32 24 -42 22 -118 -24 -22 -13 -60 -27 -85 -30
-25 -4 -61 -12 -80 -20 -35 -14 -187 -35 -250 -35 -19 0 -53 -13 -83 -31 -49
-30 -55 -31 -122 -25 -66 6 -75 4 -128 -24 -41 -22 -70 -30 -106 -30 -49 0
-50 1 -140 90 -54 54 -99 90 -111 90 -29 0 -25 16 15 57 19 20 35 40 35 45 0
23 -44 91 -69 106 -15 9 -76 68 -136 130 -99 103 -168 158 -251 196 -17 8 -39
27 -48 41 -12 18 -23 24 -35 20 -37 -11 -103 98 -120 199 -16 93 -43 179 -68
217 -13 20 -52 57 -85 81 -34 23 -75 55 -92 70 l-31 26 -5 170 c-4 138 -8 173
-21 188 -9 11 -20 35 -24 54 -13 64 -43 106 -114 164 -81 65 -98 93 -112 178
-7 45 -35 111 -107 252 -97 192 -142 291 -142 313 0 6 -9 27 -19 45 -10 18
-22 47 -25 63 -4 17 -29 57 -57 90 -27 33 -54 78 -60 100 -5 22 -17 57 -25 78
-17 46 -18 97 -1 97 12 0 107 -184 107 -207 0 -7 25 -37 55 -68 76 -78 89 -74
126 35 16 46 36 100 45 118 15 32 15 37 -5 89 -12 30 -21 64 -21 75 0 11 -7
32 -15 46 -9 15 -21 49 -28 76 -8 31 -21 56 -37 67 -23 17 -29 18 -80 5 -45
-12 -67 -13 -120 -3 -55 10 -65 16 -68 34 -4 25 5 31 218 156 169 99 186 109
308 178 173 99 923 483 1047 536 351 150 401 171 490 203 33 12 79 31 103 41
23 10 50 19 60 19 9 1 35 9 57 20 22 11 48 19 58 20 10 0 35 9 57 20 22 11 49
20 60 20 11 0 38 9 60 20 22 11 50 20 62 20 13 0 43 9 67 20 24 11 52 20 63
20 10 0 32 7 49 15 16 9 48 19 72 24 23 5 62 16 87 24 149 51 439 104 725 131
101 10 432 -3 505 -19z m-8423 -5530 c48 -20 68 -38 109 -101 21 -32 34 -63
34 -84 0 -23 9 -41 33 -65 45 -45 124 -56 200 -28 34 13 61 17 77 12 56 -16
98 -10 125 19 26 26 27 26 38 8 19 -31 58 -66 109 -98 56 -35 98 -101 98 -155
0 -21 -12 -79 -26 -128 -20 -68 -27 -114 -28 -192 -1 -67 -5 -106 -13 -114 -7
-7 -13 -25 -13 -40 0 -18 -13 -41 -40 -69 -46 -47 -47 -57 -21 -108 11 -20 25
-52 32 -70 7 -19 75 -97 167 -190 242 -245 264 -277 321 -467 12 -38 21 -74
21 -79 0 -5 18 -33 40 -62 27 -35 40 -63 40 -84 0 -17 10 -52 21 -78 19 -40
21 -58 15 -137 -7 -110 1 -147 48 -217 34 -53 36 -59 36 -142 0 -106 -28 -177
-90 -226 -49 -39 -100 -132 -129 -235 -49 -175 -64 -221 -82 -257 -16 -31 -19
-63 -21 -215 l-3 -178 56 -70 c54 -68 150 -228 163 -272 6 -17 -1 -27 -36 -50
-24 -16 -54 -34 -68 -41 -14 -6 -34 -18 -44 -24 -67 -43 -134 -85 -156 -95
-14 -7 -32 -17 -40 -23 -83 -57 -820 -440 -984 -511 -39 -18 -114 -52 -166
-76 -90 -42 -139 -65 -255 -118 -27 -12 -74 -32 -102 -44 -29 -11 -74 -30
-100 -40 -27 -11 -79 -32 -118 -46 -38 -14 -79 -30 -90 -35 -28 -13 -88 -34
-250 -89 -377 -127 -807 -231 -1070 -258 -186 -19 -597 0 -705 33 -179 54
-294 110 -402 196 -57 46 -165 183 -193 244 -24 55 -69 205 -79 265 -15 89
-22 219 -15 274 4 33 12 103 19 155 6 52 17 120 25 150 7 30 16 74 19 98 4 24
18 82 32 130 15 48 34 114 44 147 10 33 27 84 39 113 12 28 30 76 42 105 12
28 26 66 33 83 17 45 33 62 67 69 53 12 289 -36 369 -75 19 -9 52 -25 72 -35
20 -10 44 -15 53 -11 19 7 17 25 -17 190 -28 134 -22 320 15 451 31 110 53
172 72 207 19 33 19 67 0 74 -8 3 -29 1 -47 -4 -18 -6 -57 -13 -85 -16 -50 -6
-53 -5 -53 15 0 22 33 81 135 239 34 52 93 145 131 205 37 61 82 130 99 155
18 25 62 90 100 145 106 156 281 394 417 567 29 36 80 101 113 144 97 126 457
557 598 714 245 275 268 300 279 300 6 0 35 16 65 36 29 19 70 38 91 41 20 4
75 24 120 45 48 22 100 38 120 38 21 0 48 7 62 15 74 43 122 59 215 70 149 18
269 18 312 0z m3951 -2292 c14 -10 34 -34 44 -53 19 -34 20 -55 15 -691 -6
-713 -5 -702 -62 -747 -38 -30 -131 -31 -168 -2 -51 40 -57 84 -57 424 1 505
16 997 31 1029 29 62 137 85 197 40z m441 9 c19 -9 44 -30 55 -45 21 -28 21
-39 20 -460 0 -388 -2 -435 -17 -464 -48 -90 -174 -95 -238 -10 l-24 32 0 430
c0 414 1 431 20 465 23 40 75 70 120 70 17 0 45 -8 64 -18z m490 -9 c14 -11
34 -35 44 -54 16 -32 17 -80 15 -694 -3 -614 -4 -662 -21 -693 -26 -48 -72
-72 -135 -72 -48 0 -58 4 -87 33 -24 24 -35 46 -40 78 -3 24 -5 332 -3 684 3
619 4 641 23 673 41 69 141 91 204 45z M10465 3740 c-13 -14 -16 -28 -11 -54
6 -31 2 -40 -30 -75 -22 -26 -51 -45 -75 -51 -27 -8 -40 -17 -44 -33 -2 -12
-9 -48 -15 -79 -9 -45 -18 -63 -43 -84 -18 -15 -39 -40 -47 -58 -8 -17 -24
-32 -35 -34 -52 -8 -63 -14 -75 -42 -14 -33 -22 -35 -69 -19 -28 10 -36 8 -69
-14 -20 -14 -59 -29 -87 -32 -60 -9 -92 -35 -101 -84 -4 -20 -22 -59 -41 -86
l-33 -51 34 -64 c19 -37 37 -88 40 -119 4 -30 14 -67 22 -82 22 -43 17 -90
-12 -130 -54 -71 -91 -137 -132 -230 -46 -105 -53 -167 -27 -222 20 -44 65
-202 65 -231 0 -31 46 -152 71 -187 14 -20 40 -34 89 -50 66 -21 73 -21 108
-6 20 8 71 26 112 38 41 13 87 32 102 42 29 22 65 99 74 161 5 35 59 212 95
311 6 17 19 57 29 90 10 33 31 98 47 145 70 202 122 410 129 517 3 48 11 73
31 105 23 34 29 56 33 122 l5 81 33 3 33 3 -4 87 c-6 134 -31 234 -83 329 -56
103 -84 122 -119 83z"/>
</g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2.5', className)}>
      <Mark className="h-7 w-7" />
      <span className="whitespace-nowrap text-[0.95rem] font-semibold tracking-[-0.01em]">
        AfriOrbit{' '}
        {/* The qualifier is the first thing to go when space runs out — the
            mark plus "AfriOrbit" is still unambiguous, three wrapped lines are
            not. */}
        <span className="hidden font-normal text-[var(--text-muted)] sm:inline">Learning</span>
      </span>
    </Link>
  );
}

/**
 * The two ways out of the learning platform.
 *
 * `HomeLink` is INTERNAL now — the marketing pages were a separate deployment
 * and are served from /home by this application, so it is a next/link with
 * prefetching and client navigation, not an anchor to another origin.
 *
 * `MainSiteLink` is the one that genuinely leaves: afriorbit.space is the
 * company front door and runs on Squarespace. `↗` marks it as such, which is
 * the honest signal when the destination is a different hostname with a
 * different visual language.
 */
function HomeLink({ className }: { className?: string }) {
  return (
    <Link
      href={HOME_PATH}
      className={cn(
        'inline-flex items-center border border-[var(--border-strong)] px-3 py-1.5',
        'text-[0.8125rem] text-[var(--text-muted)] transition-colors',
        'hover:border-[var(--text)] hover:text-[var(--text)]',
        className,
      )}
    >
      {HOME_LABEL}
    </Link>
  );
}

function MainSiteLink({ className }: { className?: string }) {
  return (
    <a
      href={MAIN_SITE_URL}
      className={cn(
        'group inline-flex items-center gap-1.5 border border-[var(--border-strong)] px-3 py-1.5',
        'text-[0.8125rem] text-[var(--text-muted)] transition-colors',
        'hover:border-[var(--text)] hover:text-[var(--text)]',
        className,
      )}
    >
      {MAIN_SITE_LABEL}
      <span aria-hidden className="text-[0.8em] transition-transform group-hover:translate-x-0.5">
        ↗
      </span>
    </a>
  );
}

const PUBLIC_LINKS = [
  { href: '/catalog', label: 'Courses' },
  { href: '/cohorts', label: 'Cohorts' },
  { href: '/verify', label: 'Verify a certificate' },
];

export async function SiteNav() {
  const ctx = await getSessionContext();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/92 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <div className="hidden items-center gap-1 md:flex">
            {PUBLIC_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <HomeLink className="hidden lg:inline-flex" />
          <MainSiteLink className="hidden lg:inline-flex" />
          {ctx ? (
            <>
              <span className="hidden text-sm text-[var(--text-muted)] lg:inline">
                {ctx.profile.full_name || ctx.email}
              </span>
              <ButtonLink href="/dashboard" size="sm" className="whitespace-nowrap">
                Dashboard
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink href="/login" size="sm" variant="ghost" className="whitespace-nowrap">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" size="sm" className="whitespace-nowrap">
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Create account</span>
              </ButtonLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const columns = [
    {
      heading: 'Learn',
      links: [
        { href: '/catalog', label: 'Course catalogue' },
        { href: '/cohorts', label: 'Cohorts' },
        { href: '/labs', label: 'Lab sessions' },
        { href: '/verify', label: 'Verify a certificate' },
      ],
    },
    {
      heading: 'Account',
      links: [
        { href: '/login', label: 'Sign in' },
        { href: '/register', label: 'Create account' },
        { href: '/redeem', label: 'Redeem an invitation' },
        { href: '/account', label: 'Your account' },
      ],
    },
  ];

  return (
    <footer className="mt-24 border-t border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-10 py-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <span className="flex items-center gap-2.5">
              <Mark className="h-8 w-8" />
              <span className="text-base font-semibold tracking-[-0.01em]">
                AfriOrbit <span className="font-normal text-[var(--text-muted)]">Learning</span>
              </span>
            </span>
            <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-[var(--text-muted)]">
              The training platform for the EduSat programme. Assessed courses, instructor-graded
              lab reports, and certificates anyone can verify from a code.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <HomeLink />
              <MainSiteLink />
              <a
                href={`mailto:${publicEnv.supportEmail}`}
                className="border-b border-[var(--border-strong)] pb-0.5 font-mono text-[0.8125rem] text-[var(--text)] transition-colors hover:border-[var(--text)]"
              >
                {publicEnv.supportEmail}
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <nav key={col.heading} aria-label={col.heading} className="lg:col-span-3">
              <h2 className="t-label">{col.heading}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="t-label">
            © {new Date().getFullYear()} {publicEnv.brandName}
          </p>
          <p className="t-label">Nairobi, Kenya</p>
        </div>
      </div>
    </footer>
  );
}
