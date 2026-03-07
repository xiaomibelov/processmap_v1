import { useCallback, useRef, useState } from "react";

function getDefaultCommandStatus() {
  return { kind: "", text: "" };
}

function getDefaultAiQuestionStatus() {
  return { kind: "", text: "" };
}

function getDefaultAutoPassJobState() {
  return {
    jobId: "",
    status: "idle",
    progress: 0,
    startedAtMs: 0,
    error: "",
  };
}

function getDefaultAutoPassPrecheck() {
  return {
    loading: false,
    canRun: true,
    reason: "",
    code: "",
  };
}

export default function useProcessStageActionState({
  sid,
  readCommandHistory,
} = {}) {
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [aiBottleneckOn, setAiBottleneckOn] = useState(false);
  const [aiStepBusy, setAiStepBusy] = useState(false);
  const [isManualSaveBusy, setIsManualSaveBusy] = useState(false);
  const [apiClarifyHints, setApiClarifyHints] = useState([]);
  const [apiClarifyList, setApiClarifyList] = useState([]);
  const [llmClarifyList, setLlmClarifyList] = useState([]);
  const [apiClarifyMeta, setApiClarifyMeta] = useState(null);
  const [commandInput, setCommandInput] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandStatus, setCommandStatus] = useState(getDefaultCommandStatus);
  const [commandHistory, setCommandHistory] = useState([]);
  const [qualityIssueFocusKey, setQualityIssueFocusKey] = useState("");
  const [aiQuestionsBusy, setAiQuestionsBusy] = useState(false);
  const [aiQuestionsStatus, setAiQuestionsStatus] = useState(getDefaultAiQuestionStatus);
  const [autoPassJobState, setAutoPassJobState] = useState(getDefaultAutoPassJobState);
  const [autoPassPrecheck, setAutoPassPrecheck] = useState(getDefaultAutoPassPrecheck);
  const autoPassPrecheckReqSeqRef = useRef(0);

  const resetActionsForSession = useCallback(() => {
    setGenBusy(false);
    setGenErr("");
    setInfoMsg("");
    setAiBottleneckOn(false);
    setAiStepBusy(false);
    setIsManualSaveBusy(false);
    setApiClarifyHints([]);
    setApiClarifyList([]);
    setLlmClarifyList([]);
    setApiClarifyMeta(null);
    setCommandInput("");
    setCommandBusy(false);
    setCommandStatus(getDefaultCommandStatus());
    setCommandHistory(typeof readCommandHistory === "function" ? readCommandHistory(sid) : []);
    setQualityIssueFocusKey("");
    setAiQuestionsBusy(false);
    setAiQuestionsStatus(getDefaultAiQuestionStatus());
    setAutoPassJobState(getDefaultAutoPassJobState());
  }, [readCommandHistory, sid]);

  return {
    genBusy,
    setGenBusy,
    genErr,
    setGenErr,
    infoMsg,
    setInfoMsg,
    aiBottleneckOn,
    setAiBottleneckOn,
    aiStepBusy,
    setAiStepBusy,
    isManualSaveBusy,
    setIsManualSaveBusy,
    apiClarifyHints,
    setApiClarifyHints,
    apiClarifyList,
    setApiClarifyList,
    llmClarifyList,
    setLlmClarifyList,
    apiClarifyMeta,
    setApiClarifyMeta,
    commandInput,
    setCommandInput,
    commandBusy,
    setCommandBusy,
    commandStatus,
    setCommandStatus,
    commandHistory,
    setCommandHistory,
    qualityIssueFocusKey,
    setQualityIssueFocusKey,
    aiQuestionsBusy,
    setAiQuestionsBusy,
    aiQuestionsStatus,
    setAiQuestionsStatus,
    autoPassJobState,
    setAutoPassJobState,
    autoPassPrecheck,
    setAutoPassPrecheck,
    autoPassPrecheckReqSeqRef,
    resetActionsForSession,
  };
}
