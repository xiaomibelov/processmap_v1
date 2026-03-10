export default function CopilotCard({ title, questions }) {
  return (
    <div className="copilotCard">
      <div className="copilotHead">
        <div>{title}</div>
        <div className="spacer" />
        <div style={{ opacity: 0.9 }}>▾</div>
      </div>

      <div className="copilotBody">
        {questions.map((q) => (
          <div className="qRow" key={q}>
            <div className="qDot" />
            <div>{q}</div>
          </div>
        ))}

        <div className="linkRow">＋ Добавить исключение</div>
      </div>
    </div>
  );
}
