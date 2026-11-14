//! Level meters and spectrum for the visualizers. Runs on an analysis thread,
//! never inside the audio callback.

pub const FFT_SIZE: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Levels {
    pub rms: f32,
    pub peak: f32,
    pub bands: [f32; 16],
    pub wave: [f32; 64],
}

impl Levels {
    pub const SILENT: Levels = Levels { rms: 0.0, peak: 0.0, bands: [0.0; 16], wave: [0.0; 64] };
}

/// Analyze the most recent mono frames (any length; uses the last FFT_SIZE, zero-padded if shorter).
pub fn analyze(mono: &[f32], sample_rate: u32) -> Levels {
    let src = &mono[mono.len().saturating_sub(FFT_SIZE)..];
    if src.is_empty() {
        return Levels::SILENT;
    }
    // Older end zero-padded so the newest frames stay at the end of the window.
    let mut win = [0.0f32; FFT_SIZE];
    win[FFT_SIZE - src.len()..].copy_from_slice(src);

    let peak = src.iter().fold(0.0f32, |m, v| m.max(v.abs())).min(1.0);
    let rms = (src.iter().map(|v| v * v).sum::<f32>() / src.len() as f32).sqrt().min(1.0);

    let mut wave = [0.0f32; 64];
    for (i, w) in wave.iter_mut().enumerate() {
        *w = win[i * FFT_SIZE / 64].clamp(-1.0, 1.0);
    }

    // Hann window, then FFT.
    let n = FFT_SIZE as f32;
    let mut re = win;
    let mut im = [0.0f32; FFT_SIZE];
    let mut wsum = 0.0;
    for (i, r) in re.iter_mut().enumerate() {
        let h = 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n).cos();
        *r *= h;
        wsum += h;
    }
    fft(&mut re, &mut im);

    // 2/sum(window) makes a full-scale sine read magnitude 1 in its bin.
    let mag = |k: usize| 2.0 * (re[k] * re[k] + im[k] * im[k]).sqrt() / wsum;
    let bin_hz = sample_rate as f32 / n;
    let max_bin = FFT_SIZE / 2 - 1;
    let edge = |i: usize| 40.0 * 400f32.powf(i as f32 / 16.0);
    let mut bands = [0.0f32; 16];
    for (i, b) in bands.iter_mut().enumerate() {
        let (lo, hi) = (edge(i), edge(i + 1));
        let first = (lo / bin_hz).ceil() as usize;
        let last = (((hi / bin_hz).ceil() as usize).saturating_sub(1)).min(max_bin);
        let m = if first <= last {
            (first..=last).map(mag).fold(0.0, f32::max)
        } else {
            // Band narrower than one bin: take the bin nearest its centre.
            mag((((lo * hi).sqrt() / bin_hz).round() as usize).clamp(1, max_bin))
        };
        let db = 20.0 * m.max(1e-9).log10();
        *b = ((db + 60.0) / 60.0).clamp(0.0, 1.0);
    }
    Levels { rms, peak, bands, wave }
}

/// In-place iterative radix-2 complex FFT; length must be a power of two.
fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    let bits = n.trailing_zeros();
    for i in 0..n {
        let j = i.reverse_bits() >> (usize::BITS - bits);
        if j > i {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * std::f32::consts::PI / len as f32;
        for start in (0..n).step_by(len) {
            for k in 0..len / 2 {
                let (wr, wi) = ((ang * k as f32).cos(), (ang * k as f32).sin());
                let (a, b) = (start + k, start + k + len / 2);
                let tr = re[b] * wr - im[b] * wi;
                let ti = re[b] * wi + im[b] * wr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
        len <<= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 48_000;

    fn sine(freq: f32, n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / SR as f32).sin())
            .collect()
    }

    fn band_of(freq: f32) -> usize {
        ((freq / 40.0).ln() / 400f32.ln() * 16.0).floor() as usize
    }

    fn argmax(b: &[f32; 16]) -> usize {
        (0..16).max_by(|&a, &c| b[a].total_cmp(&b[c])).unwrap()
    }

    #[test]
    fn silence_is_silent() {
        assert_eq!(analyze(&[0.0; 2048], SR), Levels::SILENT);
    }

    #[test]
    fn full_scale_1khz_sine() {
        let l = analyze(&sine(1000.0, 4096), SR);
        assert!((l.peak - 1.0).abs() < 0.01, "peak {}", l.peak);
        assert!((l.rms - 0.707).abs() < 0.02, "rms {}", l.rms);
        let b = band_of(1000.0);
        assert_eq!(argmax(&l.bands), b);
        assert!(l.bands[b] > 0.8, "band {}", l.bands[b]);
        assert!(l.bands[0] < 0.3 && l.bands[15] < 0.3);
    }

    #[test]
    fn low_sine_peaks_below_high_sine() {
        let lo = argmax(&analyze(&sine(100.0, 2048), SR).bands);
        let hi = argmax(&analyze(&sine(5000.0, 2048), SR).bands);
        assert!(lo < hi, "{lo} vs {hi}");
    }

    #[test]
    fn wave_is_clamped_and_tracks_dc() {
        let l = analyze(&sine(300.0, 2048), SR);
        assert!(l.wave.iter().all(|v| (-1.0..=1.0).contains(v)));
        let dc = analyze(&[0.5; 2048], SR);
        assert!(dc.wave.iter().all(|v| (v - 0.5).abs() < 0.01));
    }

    #[test]
    fn short_input_does_not_panic() {
        analyze(&[], SR);
        analyze(&[0.3; 10], SR);
    }
}
