/**
 * Main app class - coordinates all the quiz stuff
 * Uses OOP and demonstrates bind/call/apply with 'this' context
 */
class QuizApp {
    constructor() {
        // init the player and quiz
        this.playerEntity = new Player();
        this.quizModule = new Quiz(this.playerEntity);
        this.qGen = null;
        
        // bind() to make sure 'this' is correct when listeners fire
        this.setupListeners = this.setupListeners.bind(this);
        this.setupListeners();
    }

    /**
     * Setup all the event listeners for buttons
     * Shows use of call(), bind(), and apply()
     */
    setupListeners() {
        // Using bind() to keep context
        document.getElementById('next-btn').addEventListener('click', 
            this.quizModule.moveToNextQ.bind(this.quizModule));
        
        // Using call() to explicitly set 'this'
        const restartElement = document.getElementById('restart-btn');
        restartElement.addEventListener('click', () => {
            this.quizModule.restartQuiz.call(this.quizModule);
        });
    }

    /**
     * Initialize everything asynchronously
     * Fetches questions and starts the generator
     */
    async init() {
        const questionsLoaded = await this.quizModule.fetchQuestionsFromAPI();
        if (questionsLoaded) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('quiz-content').style.display = 'block';
            
            // setup the generator - it will control the quiz progression
            this.qGen = quizFlowGenerator(this.quizModule);
            this.quizModule.qGen = this.qGen;
            
            this.quizModule.initializeQuiz();
        } else {
            document.getElementById('loading').textContent = 'Oops, couldn\'t load the questions. Try refreshing.';
        }
    }
}

// when page loads, start the app
document.addEventListener('DOMContentLoaded', () => {
    const quizApp = new QuizApp();
    quizApp.init();
});

/**
 * Calculate what difficulty the next questions should be
 * based on how well the player is doing
 */
function calculateDificultyLevel(performanceScore) {
    if (performanceScore > 0.7) return 'hard';
    if (performanceScore > 0.4) return 'medium';
    return 'easy';
}

/**
 * Question represents one trivia question
 * Encapsulates: text, choices, correct answer, difficulty
 */
class Question {
    constructor(questionText, answerChoices, correctAns, difficultyLevel = 'medium') {
        this.questionText = questionText;
        this.answerChoices = answerChoices;
        this.correctAns = correctAns;
        this.difficultyLevel = difficultyLevel;
    }

    /**
     * Check if user's answer matches correct answer
     */
    validateAnswer(userSelectedAnswer) {
        return userSelectedAnswer === this.correctAns;
    }
}

/**
 * Player class - tracks user info and history
 * This is the User class mentioned in requirements
 */
class Player {
    constructor(username = 'Player') {
        this.username = username;
        this.allScores = [];
        this.recentScore = 0;
    }

    /**
     * Record a quiz attempt in the history
     */
    recordQuizAttempt(pointsEarned, totalPoints) {
        this.allScores.push({
            score: pointsEarned,
            total: totalPoints,
            percentage: Math.round((pointsEarned / totalPoints) * 100),
            timestamp: new Date().toLocaleDateString()
        });
    }

    /**
     * Reset score between quizzes
     */
    clearCurrentScore() {
        this.recentScore = 0;
    }
}

/**
 * Quiz - manages quiz state and operations
 * Uses OOP, async/await, and generator integration
 */
class Quiz {
    constructor(playerObj) {
        this.playerObj = playerObj;
        this.allQuestions = [];
        this.currentQIndex = 0;
        this.totalScore = 0;
        this.quizRunning = false;
        this.qGen = null;
        
        // bind these methods so 'this' stays correct
        this.selectAnswer = this.selectAnswer.bind(this);
        this.moveToNextQ = this.moveToNextQ.bind(this);
        this.restartQuiz = this.restartQuiz.bind(this);
    }

    /**
     * Fetch questions from Open Trivia DB using async/await
     * Shows proper error handling
     */
    async fetchQuestionsFromAPI() {
        try {
            const res = await fetch('https://opentdb.com/api.php?amount=10&type=multiple');
            const jsonData = await res.json();
            
            if (jsonData.results) {
                this.allQuestions = jsonData.results.map(q => {
                    // mix up the answer choices
                    const shuffledChoices = [...q.incorrect_answers, q.correct_answer]
                        .sort(() => Math.random() - 0.5);
                    
                    return new Question(
                        this.unescapeHTMLEntities(q.question),
                        shuffledChoices.map(choice => this.unescapeHTMLEntities(choice)),
                        this.unescapeHTMLEntities(q.correct_answer),
                        q.difficulty
                    );
                });
                return true;
            }
        } catch (err) {
            console.error('Failed to fetch from API:', err);
            return false;
        }
    }

    /**
     * Unescape HTML entities from API response
     */
    unescapeHTMLEntities(htmlStr) {
        const tempElement = document.createElement('textarea');
        tempElement.innerHTML = htmlStr;
        return tempElement.value;
    }

    /**
     * Start the quiz and begin the generator
     */
    initializeQuiz() {
        this.quizRunning = true;
        this.currentQIndex = 0;
        this.totalScore = 0;
        this.playerObj.clearCurrentScore();
        
        // begin generator
        const genStart = this.qGen.next();
        if (!genStart.done) {
            this.displayCurrentQuestion();
        }
    }

    /**
     * Display the current question to the user
     */
    displayCurrentQuestion() {
        if (this.currentQIndex >= this.allQuestions.length) {
            this.finishQuiz();
            return;
        }

        const currentQ = this.allQuestions[this.currentQIndex];
        
        document.getElementById('question-number').textContent = 
            `Question ${this.currentQIndex + 1} of ${this.allQuestions.length}`;
        document.getElementById('question-text').textContent = currentQ.questionText;
        document.getElementById('score').textContent = `Score: ${this.totalScore}`;

        // make answer buttons
        const answerContainer = document.getElementById('answers');
        answerContainer.innerHTML = '';
        
        currentQ.answerChoices.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn';
            btn.textContent = option;
            // using call() to set context explicitly
            btn.addEventListener('click', () => this.selectAnswer.call(this, option));
            answerContainer.appendChild(btn);
        });

        // hide stuff at first
        document.getElementById('feedback').style.display = 'none';
        document.getElementById('next-btn').style.display = 'none';
    }

    /**
     * Handle when user selects an answer
     * Passes answer to generator via .next()
     */
    selectAnswer(chosenAnswer) {
        if (!this.quizRunning) return;

        const currentQ = this.allQuestions[this.currentQIndex];
        const answerIsRight = currentQ.validateAnswer(chosenAnswer);
        
        // update score right away
        if (answerIsRight) {
            this.totalScore++;
            this.playerObj.recentScore++;
        }

        // show which buttons are right/wrong
        const allBtns = document.querySelectorAll('.answer-btn');
        allBtns.forEach(button => {
            button.disabled = true;
            if (button.textContent === currentQ.correctAns) {
                button.classList.add('correct');
            } else if (button.textContent === chosenAnswer && !answerIsRight) {
                button.classList.add('incorrect');
            }
        });

        // display feedback message
        const feedbackArea = document.getElementById('feedback');
        feedbackArea.style.display = 'block';
        feedbackArea.className = answerIsRight ? 'correct' : 'incorrect';
        feedbackArea.textContent = answerIsRight ? 
            'Yep! That\'s right.' : 
            `Nope. The answer was: ${currentQ.correctAns}`;

        // IMPORTANT: send answer to generator to drive flow
        const genResult = this.qGen.next(chosenAnswer);
        
        if (!genResult.done) {
            document.getElementById('next-btn').style.display = 'block';
        } else {
            setTimeout(() => this.finishQuiz(), 1200);
        }
    }

    /**
     * Move to the next question
     */
    moveToNextQ() {
        this.currentQIndex++;
        this.displayCurrentQuestion();
    }

    /**
     * End the quiz and show results
     * Demonstrates apply() by passing score data as an array
     */
    finishQuiz() {
        this.quizRunning = false;
        
        // Using apply() to demonstrate passing arguments as an array
        const scoreArgs = [this.totalScore, this.allQuestions.length];
        this.playerObj.recordQuizAttempt.apply(this.playerObj, scoreArgs);
        
        document.getElementById('quiz-content').style.display = 'none';
        document.getElementById('final-score').style.display = 'block';
        
        const finalPercent = Math.round((this.totalScore / this.allQuestions.length) * 100);
        document.getElementById('final-result').textContent = 
            `You got ${this.totalScore} out of ${this.allQuestions.length} correct (${finalPercent}%)`;
        
        this.showPreviousScores();
    }

    /**
     * Display all the scores from previous attempts
     */
    showPreviousScores() {
        const scoreContainer = document.getElementById('score-history');
        if (this.playerObj.allScores.length > 0) {
            scoreContainer.innerHTML = '<h3>Your past quizzes:</h3>';
            this.playerObj.allScores.forEach((record, idx) => {
                const scoreDiv = document.createElement('div');
                scoreDiv.textContent = `Quiz ${idx + 1}: ${record.score}/${record.total} (${record.percentage}%) on ${record.timestamp}`;
                scoreContainer.appendChild(scoreDiv);
            });
        }
    }

    /**
     * Restart the quiz with new questions
     */
    async restartQuiz() {
        document.getElementById('final-score').style.display = 'none';
        document.getElementById('loading').style.display = 'block';
        
        const newQuestionsLoaded = await this.fetchQuestionsFromAPI();
        if (newQuestionsLoaded) {
            // reset generator with new questions
            this.qGen = quizFlowGenerator(this);
            
            document.getElementById('loading').style.display = 'none';
            document.getElementById('quiz-content').style.display = 'block';
            this.initializeQuiz();
        } else {
            document.getElementById('loading').textContent = 'Couldn\'t reload questions. Try again plz.';
        }
    }
}

/**
 * Generator function controls the quiz flow
 * 
 * This is the central control mechanism that:
 * - Yields questions one at a time
 * - Receives user answers via .next(answer)
 * - Adjusts difficulty dynamically based on performance
 * 
 * Demonstrates generator pattern with yield for controlling async flow
 */
function* quizFlowGenerator(quizObj) {
    let qIndex = 0;
    let correctCount = 0;
    
    while (qIndex < quizObj.allQuestions.length) {
        const q = quizObj.allQuestions[qIndex];
        
        // yield the question and WAIT for answer to come back via .next()
        const playerAnswer = yield q;
        
        // check the answer
        const isRightAnswer = q.validateAnswer(playerAnswer);
        if (isRightAnswer) {
            correctCount++;
        }
        
        qIndex++;
        
        // ADAPTIVE DIFFICULTY adjust based on performance
        if (qIndex < quizObj.allQuestions.length && qIndex > 0) {
            const currentPerf = correctCount / qIndex;
            const targetDiff = calculateDificultyLevel(currentPerf);
            
            // reorder remaining questions by difficulty
            const remainingQs = quizObj.allQuestions.slice(qIndex);
            
            remainingQs.sort((q1, q2) => {
                // put target difficulty first
                if (q1.difficultyLevel === targetDiff && q2.difficultyLevel !== targetDiff) {
                    return -1;
                }
                if (q2.difficultyLevel === targetDiff && q1.difficultyLevel !== targetDiff) {
                    return 1;
                }
                // randomize within same priority
                return Math.random() - 0.5;
            });
            
            // update the questions list
            quizObj.allQuestions = [
                ...quizObj.allQuestions.slice(0, qIndex),
                ...remainingQs
            ];
            
            console.log(`Performance: ${(currentPerf * 100).toFixed(0)}% --> Targeting ${targetDiff} next`);
        }
    }
    
    return 'Quiz finished!';
}