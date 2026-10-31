//! DSP chain between decoder and output. Empty in Phase 1; an EQ stage is
//! inserted later without touching decode or output code.

pub trait DspStage: Send {
    fn process(&mut self, buf: &mut [f32], channels: u16, sample_rate: u32);
}

pub struct DspChain {
    stages: Vec<Box<dyn DspStage>>,
}

impl DspChain {
    pub fn new() -> Self {
        Self { stages: Vec::new() }
    }

    pub fn push(&mut self, stage: Box<dyn DspStage>) {
        self.stages.push(stage);
    }

    pub fn is_empty(&self) -> bool {
        self.stages.is_empty()
    }

    pub fn process(&mut self, buf: &mut [f32], channels: u16, sample_rate: u32) {
        for stage in &mut self.stages {
            stage.process(buf, channels, sample_rate);
        }
    }
}

impl Default for DspChain {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Gain(f32);
    impl DspStage for Gain {
        fn process(&mut self, buf: &mut [f32], _channels: u16, _sample_rate: u32) {
            buf.iter_mut().for_each(|s| *s *= self.0);
        }
    }

    #[test]
    fn empty_chain_is_identity() {
        let mut chain = DspChain::new();
        assert!(chain.is_empty());
        let mut buf = [0.1, -0.2, 0.3, 0.4];
        let orig = buf;
        chain.process(&mut buf, 2, 44100);
        assert_eq!(buf, orig);
    }

    #[test]
    fn stage_is_applied() {
        let mut chain = DspChain::default();
        chain.push(Box::new(Gain(0.5)));
        assert!(!chain.is_empty());
        let mut buf = [1.0, -1.0, 0.5, 0.0];
        chain.process(&mut buf, 2, 44100);
        assert_eq!(buf, [0.5, -0.5, 0.25, 0.0]);
    }

    #[test]
    fn stages_run_in_order() {
        let mut chain = DspChain::new();
        chain.push(Box::new(Gain(0.5)));
        chain.push(Box::new(Gain(0.5)));
        let mut buf = [1.0];
        chain.process(&mut buf, 1, 48000);
        assert_eq!(buf, [0.25]);
    }
}
