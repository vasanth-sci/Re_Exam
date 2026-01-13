chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // 1. INITIALIZE GLOBAL STATE
      if (!window.__gate) {
        window.__gate = { responses: {}, evaluated: false };
      }

      // 2. PROFESSIONAL STYLES
      if (!document.getElementById("gate-final-styles")) {
        const style = document.createElement("style");
        style.id = "gate-final-styles";
        style.textContent = `
          /* Faculty answers hidden only during exam */
          html[data-exam="on"] .faculty-answer,
          html[data-exam="on"] .qt-feedback {
            display: none !important;
          }

          /* Feedback header hidden FOREVER */
          .feedback-header {
            display: none !important;
          }

          
          /* Evaluation Badges */
          .gate-badge {
            display: inline-block; padding: 5px 14px; border-radius: 4px;
            font-size: 13px; font-weight: bold; margin-top: 10px; font-family: sans-serif;
          }
          .b-correct { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
          .b-wrong { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
          .b-skipped { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
          .b-nat { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }

          /* Summary Modal */
          #gate-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 99999;
            display: flex; align-items: center; justify-content: center;
          }
          .gate-modal {
            background: #fff; padding: 30px; border-radius: 12px; width: 95%; max-width: 650px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.5); font-family: 'Segoe UI', Roboto, sans-serif;
            max-height: 90vh; overflow-y: auto;
          }
          .gate-table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px; }
          .gate-table th, .gate-table td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
          .gate-table th { background: #f8fafc; color: #475569; font-weight: 600; }
          .score-total { font-size: 28px; color: #2563eb; font-weight: bold; }
          .btn-close { 
            width: 100%; padding: 12px; background: #2563eb; color: #fff; border: none; 
            border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 16px; margin-top: 10px;
          }
        `;
        document.head.appendChild(style);
      }

      const root = document.documentElement;
      const isExamActive = root.getAttribute("data-exam") === "on";

      if (isExamActive) {
        // --- EVALUATION MODE ---
        let report = {
          m1: { total: 0, att: 0, correct: 0, wrong: 0, score: 0 },
          m2: { total: 0, att: 0, correct: 0, wrong: 0, score: 0 },
          mcq: { att: 0, score: 0 },
          msq: { att: 0, score: 0 },
          natCount: 0
        };

        document.querySelectorAll(".qt-mc-question, .qt-sa-question").forEach(q => {
          const ptsText = q.querySelector(".qt-points")?.innerText || "";
          const pts = ptsText.includes("2") ? 2 : 1;
          const cat = pts === 1 ? 'm1' : 'm2';
          report[cat].total++;

          if (q.classList.contains("qt-sa-question")) {
            report.natCount++;
            renderBadge(q, "NAT - Manual Verification", "b-nat");
            return;
          }

          // Identify if MCQ (radio) or MSQ (checkbox)
          const isMSQ = q.querySelector('input[type="checkbox"]');
          const typeLabel = isMSQ ? 'msq' : 'mcq';

          const correctIds = [...q.querySelectorAll(".faculty-answer label")].map(l => l.getAttribute("for")).sort();
          const userResp = window.__gate.responses[q.id];

          if (userResp && userResp.values.length > 0) {
            report[cat].att++;
            report[typeLabel].att++;
            
            const isMatch = JSON.stringify(userResp.values.sort()) === JSON.stringify(correctIds);
            
            if (isMatch) {
              report[cat].correct++;
              report[cat].score += pts;
              report[typeLabel].score += pts;
              renderBadge(q, `CORRECT (+${pts})`, "b-correct");
            } else {
              report[cat].wrong++;
              const penalty = userResp.type === "radio" ? (pts / 3) : 0;
              report[cat].score -= penalty;
              report[typeLabel].score -= penalty;
              renderBadge(q, `WRONG (-${penalty.toFixed(2)})`, "b-wrong");
            }
          } else {
            renderBadge(q, "SKIPPED", "b-skipped");
          }
        });
                // Stop timer
        clearInterval(window.__examTimerInterval);
        document.getElementById("examTimer")?.remove();
        window.__examTimerStarted = false;
        document.getElementById("gateCalcBtn")?.remove();
        document.getElementById("gatePalette")?.remove();



        showFinalReport(report);
        root.removeAttribute("data-exam");
      } else {
        // --- START MODE ---
                // --- START 3 HOUR TIMER ---
        if (!window.__examTimerStarted) {
          window.__examTimerStarted = true;

          let totalSeconds = 180 * 60;

          const timer = document.createElement("div");
          timer.id = "examTimer";
          timer.style = `
            position: fixed;
            top: 15px;
            right: 15px;
            background: #0f172a;
            color: white;
            padding: 10px 16px;
            font-size: 18px;
            font-family: monospace;
            border-radius: 8px;
            z-index: 9999999;
            
          `;
          document.body.appendChild(timer);

          window.__examTimerInterval = setInterval(() => {
         const m = String(Math.floor(totalSeconds / 60)).padStart(3, "0");  // 180 → 179 → ...
        const s = String(totalSeconds % 60).padStart(2, "0");

        timer.textContent = `⏱ ${m}:${s}`;


            if (totalSeconds <= 0) {
              timer.textContent = "⏰ TIME UP";
              timer.style.color = "red";
              clearInterval(window.__examTimerInterval);
            }

            totalSeconds--;
          }, 1000);
        }
        // --- ADD CALCULATOR BUTTON ---
        if (!document.getElementById("gateCalcBtn")) {
          const btn = document.createElement("button");
          btn.id = "gateCalcBtn";
          btn.innerText = "🧮 Calculator";

          btn.style = `
            position: fixed;
            top: 70px;
            right: 20px;
            background: #0f172a;
            color: white;
            border: none;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            z-index: 9999999;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
          `;

          btn.onclick = () => {
            window.open(
              "https://tcsion.com/OnlineAssessment/ScientificCalculator/Calculator.html",
              "gateCalc",
              "width=475,height=350,top=80,left=1000,resizable=no,scrollbars=no"
            );
          };

          document.body.appendChild(btn);
        }

        


        const welcomeMsg = `EXAM MODE ACTIVATED\n
1. ALL QUESTIONS: Answers are now hidden.
2. MCQ/MSQ: Select your options. MSQs require all correct boxes to be checked.
3. NAT QUESTIONS: Input boxes are now enabled. Type your numerical value directly.
4. SUBMISSION: Click the extension icon again to end the exam and see your scorecard.

Note: Only MCQ/MSQ are auto-evaluated. NAT results will be revealed for manual verification.`;
        
        alert(welcomeMsg);
        
        root.setAttribute("data-exam", "on");
        // --- CREATE QUESTION PALETTE ---
        if (!document.getElementById("gatePalette")) {
          const panel = document.createElement("div");
          panel.id = "gatePalette";
          panel.style = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 180px;
            max-height: 45vh;
            overflow-y: auto;
            background: rgba(0,0,0,0.55);
            backdrop-filter: blur(6px);
            border-radius: 10px;
            box-shadow: 0 0 12px rgba(0,0,0,0.6);
            padding: 8px;
            z-index: 999999;
            font-family: sans-serif;
            color: white;
          `;

          panel.innerHTML = `
            <div style="font-weight:bold;margin-bottom:8px">Questions</div>
            <div id="gateQGrid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px"></div>
            <hr>
            <div style="font-size:12px">
              <div><span style="color:#16a34a">■</span> Answered</div>
              <div><span style="color:#2563eb">■</span> Answered-Review-later</div>
              <div><span style="color:#f59e0b">■</span> Review-Later</div>
              <div><span style="color:black">■</span> Not-Visited</div>
            </div>
          `;

          document.body.appendChild(panel);

          const grid = document.getElementById("gateQGrid");

          document.querySelectorAll(".qt-mc-question,.qt-sa-question").forEach((q, i) => {

          if (!q.querySelector(".gate-review-btn")) {
            const reviewBtn = document.createElement("button");
            reviewBtn.className = "gate-review-btn";
            reviewBtn.innerText = "Mark for Review";
            reviewBtn.style = `
              margin-top:8px;
              padding:6px 10px;
              background:#f59e0b;
              color:white;
              border:none;
              border-radius:6px;
              cursor:pointer;
            `;

            reviewBtn.onclick = () => {
              q.dataset.visited = "yes";
              if (q.dataset.review === "yes") {
                delete q.dataset.review;
                reviewBtn.innerText = "Mark for Review";
              } else {
                q.dataset.review = "yes";
                reviewBtn.innerText = "Unmark Review";
              }
              updatePalette();
            };

            q.appendChild(reviewBtn);
          }


            const btn = document.createElement("div");
            btn.innerText = i + 1;
            btn.dataset.qid = q.id;
            btn.style = `
            background:#000;
            color:white;
            padding:5px;
            font-size:12px;
            text-align:center;
            border-radius:5px;
            cursor:pointer;
          `;


            btn.onclick = () => q.scrollIntoView({ behavior:"smooth" });

            grid.appendChild(btn);
          });
        }


        window.__gate.responses = {};
        document.querySelectorAll(".gate-badge").forEach(b => b.remove());

        document.querySelectorAll('input').forEach(input => {
          input.disabled = false;
          input.removeAttribute('readonly');
          
          if (input.type === 'radio') {
            input.checked = false;

            input.onclick = function(e) {
              const container = this.closest(".qt-mc-question");
              if (!container) return;

              // toggle logic
              if (this.dataset.wasChecked === "true") {
                this.checked = false;
                this.dataset.wasChecked = "false";
                delete window.__gate.responses[container.id];
              } else {
                container.querySelectorAll('input[type="radio"]').forEach(r => r.dataset.wasChecked = "false");
                this.dataset.wasChecked = "true";
                this.checked = true;

                window.__gate.responses[container.id] = {
                  type: "radio",
                  values: [this.id]
                };
              }

              container.dataset.visited = "yes";
              updatePalette();
            };
          }

          if (input.type === 'checkbox') {
            input.checked = false;

            input.onclick = function() {
              const container = this.closest(".qt-mc-question");
              if (!container) return;

              const checked = [...container.querySelectorAll('input:checked')];

              if (checked.length === 0) {
                delete window.__gate.responses[container.id];
              } else {
                window.__gate.responses[container.id] = {
                  type: "checkbox",
                  values: checked.map(i => i.id)
                };
              }

              container.dataset.visited = "yes";
              updatePalette();
            };
          }

          
          const natContainer = input.closest(".qt-sa-question");
          if (natContainer) {
            input.type = "number";
            input.placeholder = "Enter NAT Value";
            input.oninput = function() {
              window.__gate.responses[natContainer.id] = {
                type: "number",
                values: [this.value]
              };
              container.dataset.visited = "yes";    
              updatePalette();

            };
          }
        });
      }

      function renderBadge(q, txt, cls) {
        const b = document.createElement("div");
        b.className = `gate-badge ${cls}`;
        b.innerText = txt;
        q.appendChild(b);
      }

      function showFinalReport(r) {
        const overlay = document.createElement("div");
        overlay.id = "gate-modal-overlay";
        const totalScore = (r.m1.score + r.m2.score).toFixed(2);

        overlay.innerHTML = `
          <div class="gate-modal">
            <h2 style="margin:0 0 15px 0; color:#1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom:10px;">Exam Analysis Report</h2>
            
            <div style="font-weight:600; color:#475569; margin-bottom:5px;">Marks Distribution:</div>
            <table class="gate-table">
              <thead>
                <tr>
                  <th>Weightage</th>
                  <th>Attempted</th>
                  <th>Correct</th>
                  <th>Wrong</th>
                  <th>Sub-Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1 Mark Questions</td>
                  <td>${r.m1.att}/${r.m1.total}</td>
                  <td style="color:#16a34a">${r.m1.correct}</td>
                  <td style="color:#dc2626">${r.m1.wrong}</td>
                  <td>${r.m1.score.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>2 Mark Questions</td>
                  <td>${r.m2.att}/${r.m2.total}</td>
                  <td style="color:#16a34a">${r.m2.correct}</td>
                  <td style="color:#dc2626">${r.m2.wrong}</td>
                  <td>${r.m2.score.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div style="font-weight:600; color:#475569; margin-top:15px; margin-bottom:5px;">Question Type Analysis:</div>
            <table class="gate-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Questions Attempted</th>
                  <th>Net Score</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Multiple Choice (MCQ)</td>
                  <td>${r.mcq.att}</td>
                  <td>${r.mcq.score.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Multiple Select (MSQ)</td>
                  <td>${r.msq.att}</td>
                  <td>${r.msq.score.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div style="text-align:center; margin: 20px 0; padding:15px; background:#f8fafc; border-radius:10px;">
              <div style="color:#64748b; font-size:12px; text-transform:uppercase; letter-spacing:1.5px; font-weight:700;">Final Evaluated Score</div>
              <div class="score-total">${totalScore}</div>
            </div>

            <p style="font-size:12px; color:#1e40af; background:#eff6ff; padding:12px; border-radius:6px; border-left: 4px solid #2563eb; line-height:1.5;">
              <b>NAT Summary:</b> detected ${r.natCount} NAT questions. These are not included in the auto-score. Please check your inputs against the revealed keys below each question to finalize your total.
            </p>
            
            <button class="btn-close" onclick="document.getElementById('gate-modal-overlay').remove()">Close Report</button>
          </div>
        `;
        document.body.appendChild(overlay);
      }

function updatePalette() {
  document.querySelectorAll("#gateQGrid div").forEach(btn => {
    const q = document.getElementById(btn.dataset.qid);
    const answered = window.__gate.responses[q.id];
    const reviewed = q.dataset.review === "yes";
    const visited = q.dataset.visited;

    if (!visited) {
      btn.style.background = "black";            // Not visited
    } 
    else if (reviewed && answered) {
      btn.style.background = "#2563eb";          // Blue (Answered + Review)
    } 
    else if (reviewed && !answered) {
      btn.style.background = "#f59e0b";          // Orange (Review only)
    } 
    else if (answered) {
      btn.style.background = "#16a34a";          // Green (Answered)
    } 
    else {
      btn.style.background = "black";          //  (Unanswered)
    }
  });
}


    }
  });
});

