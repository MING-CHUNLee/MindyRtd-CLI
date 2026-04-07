# Agent 調用路徑 - Mermaid 圖表

## 使用方式
1. 複製下面的 Mermaid 代碼
2. 在 draw.io 中：File → New → Diagram → 選 "Mermaid"
3. 貼上下面的代碼即可

---

## 完整調用流程圖

```mermaid
graph TD
    A["🎮 Controller<br/>ask.ts / agent.ts"] -->|user input| B["🎁 Facade Layer<br/>application/facade/agent-service.ts<br/>—————<br/>• DI Composition Root<br/>• ToolRegistry assembly<br/>• Session lifecycle<br/>• Event emitting"]
    
    B -->|route to| C1["📋 Use Case<br/>ExecuteAskUseCase<br/>—————<br/>Q&A Pipeline<br/>No tools"]
    B -->|route to| C2["✏️ Use Case<br/>ExecuteInstructionUseCase<br/>—————<br/>Edit Pipeline<br/>ReAct loop"]
    
    C1 -->|call| D1["🧠 LLMController<br/>streamPrompt<br/>—————<br/>infra/api/<br/>llm-controller.ts"]
    
    C2 -->|call| E["🎯 Orchestration Layer<br/>application/orchestration/<br/>—————<br/>ReActLoop<br/>Orchestrator<br/>ToolRegistry"]
    
    C2 -->|call| F["⚙️ Services<br/>application/services/<br/>—————<br/>DiffEngine<br/>Evaluator<br/>EditStagingService<br/>KnowledgeBase"]
    
    E -->|LLM call| D1
    E -->|dispatch| G["🛠️ Tools Layer<br/>application/tools/<br/>—————<br/>FileScanTool<br/>FileReadTool<br/>FileEditTool<br/>RExecTool<br/>RInstallTool<br/>RRenderTool<br/>PdfReadTool<br/><br/>├─ Validate input<br/>├─ Safety guards<br/>└─ Delegate to Service"]
    
    G -->|delegate| H["📦 Domain Interfaces<br/>domain/interfaces/<br/>—————<br/>IFileSystem<br/>IRScriptRunner<br/>IDirectoryScanner"]
    
    F -->|implement| H
    
    H -->|depend on| I1["💾 LocalFileSystem<br/>infrastructure/filesystem/<br/>—————<br/>read, write, mkdir<br/>exists, stat"]
    
    H -->|depend on| I2["▶️ RScriptRunner<br/>infrastructure/r-adapter/<br/>—————<br/>exec R code<br/>via Rscript"]
    
    H -->|depend on| I3["🌐 LLMController<br/>infrastructure/api/<br/>—————<br/>Multi-provider<br/>OpenAI/Anthropic/Azure"]
    
    H -->|depend on| I4["📁 DirectoryScanner<br/>infrastructure/filesystem/<br/>—————<br/>workspace scan"]
    
    G -->|ToolResult| E
    E -->|artifacts + usage| C2
    
    C2 -->|call| J["🎨 Diff Review<br/>EditStagingService<br/>—————<br/>Display patch<br/>Wait for approval"]
    
    J -->|approved| K["✅ Apply Edits<br/>IFileSystem.write()<br/>—————<br/>LocalFileSystem.write()<br/>to disk"]
    
    style A fill:#FFE6E6
    style B fill:#FFF4E6
    style C1 fill:#E6F3FF
    style C2 fill:#E6F3FF
    style D1 fill:#F0E6FF
    style E fill:#E6FFE6
    style F fill:#E6FFE6
    style G fill:#FFFFE6
    style H fill:#F0F0F0
    style I1 fill:#E6E6E6
    style I2 fill:#E6E6E6
    style I3 fill:#E6E6E6
    style I4 fill:#E6E6E6
    style J fill:#FFE6F0
    style K fill:#E6FFE6
```

---

## 簡化版：Ask Pipeline (無 Tools)

```mermaid
graph LR
    A["Controller<br/>ask.ts"] -->|instruction| B["Facade<br/>agent-service.ts"]
    B -->|route| C["ExecuteAskUseCase"]
    C -->|call| D["FileScan<br/>FileRead"]
    C -->|stream| E["LLMController<br/>sendPrompt"]
    E -->|response| F["Output<br/>ToolResult"]
    
    style A fill:#FFE6E6
    style B fill:#FFF4E6
    style C fill:#E6F3FF
    style D fill:#FFFFE6
    style E fill:#F0E6FF
    style F fill:#E6FFE6
```

---

## 簡化版：Instruction/Edit Pipeline (含 ReAct Loop)

```mermaid
graph TD
    A["Controller<br/>agent.ts<br/>user: edit this file"] -->|instruction| B["Facade<br/>agent-service.ts"]
    
    B -->|route| C["ExecuteInstructionUseCase"]
    
    C -->|orchestrate| D["Orchestrator<br/>ReActLoop<br/>—————<br/>Loop iteration"]
    
    D -->|prompt| E["LLMController<br/>sendPrompt"]
    
    E -->|[THOUGHT]<br/>[ACTION]| F{"Parse<br/>Markers"}
    
    F -->|[ACTION]| G["ToolRegistry<br/>execute<br/>—————<br/>• schema validation<br/>• error handling"]
    
    G -->|route| H["Tool<br/>file_read<br/>file_edit<br/>r_exec"]
    
    H -->|delegate| I["Service<br/>FileReadService<br/>DiffEngine<br/>RExecTool"]
    
    I -->|use| J["Domain Port<br/>IFileSystem<br/>IRScriptRunner"]
    
    J -->|implement| K["Infrastructure<br/>LocalFileSystem<br/>RScriptRunner<br/>Rscript exec"]
    
    K -->|[OBSERVATION]| D
    
    F -->|[ANSWER]| L["Extract<br/>Artifacts"]
    
    L -->|edits| M["EditStagingService<br/>DiffEngine review"]
    
    M -->|wait approval| N["User<br/>approval_callback"]
    
    N -->|approved| O["Apply<br/>IFileSystem.write"]
    
    O -->|disk| P["✅ Session saved"]
    
    style A fill:#FFE6E6
    style B fill:#FFF4E6
    style C fill:#E6F3FF
    style D fill:#E6FFE6
    style E fill:#F0E6FF
    style F fill:#FFFACD
    style G fill:#FFFFE6
    style H fill:#FFFFE6
    style I fill:#E6FFE6
    style J fill:#F0F0F0
    style K fill:#E6E6E6
    style L fill:#E6F3FF
    style M fill:#FFE6F0
    style N fill:#FFE6F0
    style O fill:#E6E6E6
    style P fill:#E6FFE6
```

---

## 層級對應表

```mermaid
graph LR
    subgraph Application["🔶 Application Layer"]
        A["Controllers<br/>(ask, agent)"]
        B["Facade<br/>(agent-service)"]
        C["Use Cases<br/>(execute-*)"]
        D["Orchestration<br/>(ReActLoop)"]
        E["Tools<br/>(FileTool)"]
        F["Services<br/>(DiffEngine)"]
    end
    
    subgraph Domain["🟦 Domain Layer<br/>(No external deps)"]
        G["Interfaces<br/>(IFileSystem,<br/>IRScriptRunner)"]
    end
    
    subgraph Infrastructure["🟩 Infrastructure<br/>(Concrete I/O)"]
        H["API<br/>(llm-controller)"]
        I["Filesystem<br/>(local-file-system)"]
        J["R Adapter<br/>(r-script-runner)"]
    end
    
    A -->|route| B
    B -->|coordinate| C
    C -->|orchestrate| D
    D -->|dispatch| E
    E -->|delegate| F
    F -->|use port| G
    G -->|implement| H
    G -->|implement| I
    G -->|implement| J
    
    style A fill:#FFE6E6
    style B fill:#FFF4E6
    style C fill:#E6F3FF
    style D fill:#E6FFE6
    style E fill:#FFFFE6
    style F fill:#E6FFE6
    style G fill:#F0F0F0
    style H fill:#E6E6E6
    style I fill:#E6E6E6
    style J fill:#E6E6E6
```

---

## 在 Draw.io 中使用

### 步驟 1: 建立新的 Diagram
```
File → New → Diagram Type: Mermaid
```

### 步驟 2: 貼上 Mermaid 代碼
複製上面任一個 mermaid 區塊的代碼，貼入 draw.io 的編輯區

### 步驟 3: 自訂樣式
- 雙擊節點修改顏色、大小
- 調整箭頭標籤
- 重新排列佈局

### 導出
- 右上角 → Download → PNG / SVG / Draw format

---

## 快速索引

| 圖表 | 用途 |
|------|------|
| 完整調用流程圖 | 全面了解每個層級及其責任 |
| Ask Pipeline | 理解 Q&A 流程（無 tools） |
| Instruction Pipeline | 理解編輯流程（含 ReAct） |
| 層級對應表 | 快速查看依賴關係 |
